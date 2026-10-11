"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Sparkles,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Loader2,
} from "lucide-react";
import { continueWriting, explainSelection } from "@/lib/ai-actions";

interface SlashMenuProps {
  editor: Editor | null;
  docId: string;
  onDismiss: () => void;
}

/** Floating menu triggered by typing "/" — AI actions + formatting. */
export default function SlashMenu({ editor, docId, onDismiss }: SlashMenuProps) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inserted, setInserted] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onDismiss]);

  useEffect(() => {
    if (!editor) return;
    const ed = editor as Editor;
    function update() {
      const { $from } = ed.state.selection;
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
      if (textBefore.endsWith("/") && $from.parent.type.name === "paragraph") {
        const coords = ed.view.coordsAtPos(ed.state.selection.from);
        setCoords({ x: coords.left, y: coords.bottom + 4 });
      } else {
        setCoords(null);
      }
    }
    ed.on("transaction", update);
    return () => {
      ed.off("transaction", update);
    };
  }, [editor]);

  if (!coords || !editor) return null;
  const ed = editor;

  function deleteSlash() {
    const { $from } = ed.state.selection;
    ed.chain().focus().deleteRange({ from: $from.pos - 1, to: $from.pos }).run();
  }

  async function runAI(key: string, fn: () => Promise<string>) {
    setBusy(key);
    deleteSlash();
    try {
      const result = await fn();
      const { from } = ed.state.selection;
      ed.chain().focus().insertContentAt(from, result).run();
      setInserted(result);
      setTimeout(() => onDismiss(), 1500);
    } catch {
      // AI errors are non-fatal in the slash menu
    } finally {
      setBusy(null);
    }
  }

  const items = [
    {
      key: "continue",
      icon: <Sparkles className="h-4 w-4 text-[#1a73e8]" />,
      label: "Continue writing",
      description: "AI continues from your cursor",
      action: () =>
        runAI("continue", async () => {
          const textBefore = ed.state.doc.textBetween(0, ed.state.selection.from, "\n");
          return continueWriting(docId, textBefore);
        }),
    },
    {
      key: "explain",
      icon: <Sparkles className="h-4 w-4 text-[#1a73e8]" />,
      label: "Explain selection",
      description: "AI explains the current paragraph",
      action: () =>
        runAI("explain", async () => {
          const { from, to } = ed.state.selection;
          const text = ed.state.doc.textBetween(from, to, "\n");
          return explainSelection(docId, text || ed.state.doc.textBetween(0, ed.state.doc.content.size, "\n").slice(0, 500));
        }),
    },
    { key: "h1", icon: <Heading1 className="h-4 w-4" />, label: "Heading 1", action: () => { deleteSlash(); ed.chain().focus().toggleHeading({ level: 1 }).run(); } },
    { key: "h2", icon: <Heading2 className="h-4 w-4" />, label: "Heading 2", action: () => { deleteSlash(); ed.chain().focus().toggleHeading({ level: 2 }).run(); } },
    { key: "h3", icon: <Heading3 className="h-4 w-4" />, label: "Heading 3", action: () => { deleteSlash(); ed.chain().focus().toggleHeading({ level: 3 }).run(); } },
    { key: "ul", icon: <List className="h-4 w-4" />, label: "Bullet list", action: () => { deleteSlash(); ed.chain().focus().toggleBulletList().run(); } },
    { key: "ol", icon: <ListOrdered className="h-4 w-4" />, label: "Numbered list", action: () => { deleteSlash(); ed.chain().focus().toggleOrderedList().run(); } },
    { key: "quote", icon: <Quote className="h-4 w-4" />, label: "Blockquote", action: () => { deleteSlash(); ed.chain().focus().toggleBlockquote().run(); } },
    { key: "hr", icon: <Minus className="h-4 w-4" />, label: "Horizontal rule", action: () => { deleteSlash(); ed.chain().focus().setHorizontalRule().run(); } },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-64 overflow-hidden rounded-xl border border-[#dadce0] bg-white shadow-xl dark:border-white/10 dark:bg-slate-800"
      style={{ left: coords.x, top: coords.y }}
    >
      <div className="flex items-center gap-1.5 border-b border-slate-900/10 px-3 py-2 text-xs font-semibold text-slate-400 dark:border-white/10">
        <Type className="h-3 w-3" />
        Insert
      </div>
      <div className="max-h-72 overflow-y-auto p-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={!!busy}
            onMouseDown={(e) => e.preventDefault()}
            onClick={item.action}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition hover:bg-slate-900/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            {busy === item.key ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#1a73e8]" />
            ) : (
              item.icon
            )}
            <span>
              <span className="block text-[13px] text-slate-700 dark:text-slate-200">
                {item.label}
              </span>
              {item.description && (
                <span className="block text-[11px] text-slate-400">
                  {item.description}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      {inserted && (
        <div className="border-t border-slate-900/10 px-3 py-2 text-xs text-[#1967d2] dark:border-white/10 dark:text-[#a8c7fa]">
          <Sparkles className="mr-1 inline h-3 w-3" />
          Inserted
        </div>
      )}
    </div>
  );
}
