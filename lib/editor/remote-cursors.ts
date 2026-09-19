"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface RemoteCursor {
  clientId: string;
  name: string;
  color: string;
  from: number; // ProseMirror doc position
  to: number;
}

export const remoteCursorsKey = new PluginKey<RemoteCursor[]>("remoteCursors");

/** Muted, low-chroma tones so the brand stays near-monochrome while peers
 *  remain distinguishable. Identity is also carried by the name label. */
const CURSOR_COLORS = [
  "#5b6b8c", // slate blue
  "#8a7d63", // taupe
  "#5f7d6b", // muted green
  "#8a5f74", // muted mauve
  "#6f6288", // muted violet
];

export function cursorColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[h % CURSOR_COLORS.length];
}

function buildCursorNode(c: RemoteCursor): HTMLElement {
  const wrap = document.createElement("span");
  wrap.style.position = "relative";
  wrap.style.borderInlineStart = `2px solid ${c.color}`;
  wrap.style.marginInlineStart = "-1px";
  wrap.style.pointerEvents = "none";

  const label = document.createElement("span");
  label.textContent = c.name;
  label.style.position = "absolute";
  label.style.top = "-1.4em";
  label.style.left = "-1px";
  label.style.background = c.color;
  label.style.color = "#ffffff";
  label.style.fontSize = "10px";
  label.style.fontWeight = "600";
  label.style.lineHeight = "1.4";
  label.style.padding = "1px 6px";
  label.style.borderRadius = "999px";
  label.style.whiteSpace = "nowrap";
  wrap.appendChild(label);

  return wrap;
}

/**
 * Renders remote collaborators' carets + selection as decorations.
 * Peer updates arrive via a transaction meta carrying RemoteCursor[].
 */
export const RemoteCursors = Extension.create({
  name: "remoteCursors",

  addProseMirrorPlugins() {
    return [
      new Plugin<RemoteCursor[]>({
        key: remoteCursorsKey,
        state: {
          init: () => [],
          apply(tr, value) {
            const meta = tr.getMeta(remoteCursorsKey) as
              | RemoteCursor[]
              | undefined;
            if (meta) return meta;
            if (tr.docChanged) {
              return value.map((c) => ({
                ...c,
                from: tr.mapping.map(c.from),
                to: tr.mapping.map(c.to),
              }));
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const cursors = remoteCursorsKey.getState(state) ?? [];
            if (cursors.length === 0) return null;
            const decos: Decoration[] = [];
            for (const c of cursors) {
              const size = state.doc.content.size;
              const from = Math.max(0, Math.min(c.from, size));
              const to = Math.max(0, Math.min(c.to, size));
              if (to > from) {
                decos.push(
                  Decoration.inline(from, to, {
                    style: `background:${c.color}22; border-radius:2px;`,
                  })
                );
              }
              decos.push(
                Decoration.widget(from, () => buildCursorNode(c), {
                  side: 1,
                  key: `cursor-${c.clientId}-${from}`,
                })
              );
            }
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
