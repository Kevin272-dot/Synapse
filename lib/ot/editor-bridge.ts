"use client";

/**
 * Bridge between TipTap transactions and plain-text OT ops.
 *
 * Plain-text OT only understands retain/insert/delete on a flat string, but
 * the editor is rich text. We keep a plain-text *projection* of the doc
 * (concatenation of block text with "\n" between blocks). For local edits we
 * diff before/after and emit an OT op; for remote ops we map projection
 * offsets back to document positions and apply via one transaction.
 */

import type { Editor } from "@tiptap/react";
import type { Operation } from "@/lib/ot/engine";

/** Serialize the editor doc to a flat plain-text projection (\n between blocks). */
export function docToText(editor: Editor): string {
  return editor.getText({ blockSeparator: "\n" });
}

/** Common-prefix/suffix diff -> an OT op mapping before -> after. */
export function diffToOp(before: string, after: string): Operation {
  if (before === after) return [];

  let p = 0;
  const minLen = Math.min(before.length, after.length);
  while (p < minLen && before[p] === after[p]) p++;

  let s = 0;
  while (
    s < minLen - p &&
    before[before.length - 1 - s] === after[after.length - 1 - s]
  ) {
    s++;
  }

  const del = before.length - p - s;
  const ins = after.slice(p, after.length - s);

  const op: Operation = [];
  if (p > 0) op.push({ retain: p });
  if (del > 0) op.push({ delete: del });
  if (ins.length > 0) op.push({ insert: ins });
  const trailing = before.length - p - del;
  if (trailing > 0) op.push({ retain: trailing });
  return op;
}

/** Apply a remote plain-text op to the editor via a single transaction. */
export function applyRemoteOp(editor: Editor, op: Operation) {
  const { state } = editor;
  const { doc } = state;

  // Build a projection of blocks: { from (doc pos), text }.
  const blocks: { from: number; text: string }[] = [];
  doc.forEach((node, offset) => {
    if (node.isTextblock) {
      blocks.push({ from: offset + 1, text: node.textContent });
    }
  });

  // Projection offset -> doc position. A projection offset can fall inside a
  // block (map to block.from + offset) or exactly at a block boundary.
  function projToDocPos(idx: number): number {
    let acc = 0;
    for (const b of blocks) {
      if (idx <= acc + b.text.length) {
        return b.from + (idx - acc);
      }
      acc += b.text.length + 1;
    }
    return doc.content.size;
  }

  // Walk the op collecting edits in doc positions. We then apply deletes and
  // inserts RIGHT-TO-LEFT so earlier positions never shift under us.
  const edits: { from: number; to?: number; text?: string }[] = [];
  let proj = 0;
  for (const c of op) {
    if ("retain" in c) {
      proj += c.retain;
    } else if ("delete" in c) {
      edits.push({ from: projToDocPos(proj), to: projToDocPos(proj + c.delete) });
      proj += c.delete;
    } else {
      edits.push({ from: projToDocPos(proj), text: c.insert });
    }
  }

  // Apply right-to-left in one transaction.
  const tr = state.tr;
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    if (e.to !== undefined) {
      tr.delete(e.from, e.to);
    } else if (e.text !== undefined) {
      tr.insertText(e.text, e.from);
    }
  }
  editor.view.dispatch(tr);
}

/** Build the [blockStart, text] projection for a doc. */
function blockProjection(editor: Editor) {
  const blocks: { from: number; text: string }[] = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.isTextblock) {
      blocks.push({ from: offset + 1, text: node.textContent });
    }
  });
  return blocks;
}

/** Map a plain-text projection offset to a ProseMirror doc position. */
export function textOffsetToDocPos(editor: Editor, idx: number): number {
  const blocks = blockProjection(editor);
  let acc = 0;
  for (const b of blocks) {
    if (idx <= acc + b.text.length) return b.from + (idx - acc);
    acc += b.text.length + 1;
  }
  return editor.state.doc.content.size;
}

/** Map a ProseMirror doc position to a plain-text projection offset. */
export function docPosToTextOffset(editor: Editor, pos: number): number {
  const blocks = blockProjection(editor);
  let acc = 0;
  for (const b of blocks) {
    if (pos <= b.from + b.text.length) {
      return acc + Math.max(0, pos - b.from);
    }
    acc += b.text.length + 1;
  }
  return acc;
}
