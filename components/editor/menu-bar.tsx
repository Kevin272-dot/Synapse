"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown } from "lucide-react";

/**
 * Docs-style menu bar (File / Edit / Insert / Format / Tools / Help).
 * Renders real dropdown menus wired to editor commands + word count.
 */
export default function EditorMenuBar({ editor }: { editor: Editor | null }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  if (!editor) return null;
  const ed = editor;

  const wordCount = editor
    .getText()
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const items: {
    key: string;
    label: string;
    entries: { label: string; shortcut?: string; danger?: boolean; action: () => void }[];
  }[] = [
    {
      key: "file",
      label: "File",
      entries: [
        { label: "New document", action: () => (window.location.href = "/dashboard") },
        { label: "Import", action: () => (window.location.href = "/dashboard") },
      ],
    },
    {
      key: "edit",
      label: "Edit",
      entries: [
        { label: "Undo", shortcut: "⌘Z", action: () => ed.chain().focus().undo().run() },
        { label: "Redo", shortcut: "⇧⌘Z", action: () => ed.chain().focus().redo().run() },
        { label: "Select all", shortcut: "⌘A", action: () => ed.commands.selectAll() },
        {
          label: "Clear formatting",
          action: () => ed.chain().focus().clearNodes().unsetAllMarks().run(),
        },
      ],
    },
    {
      key: "insert",
      label: "Insert",
      entries: [
        { label: "Horizontal rule", action: () => ed.chain().focus().setHorizontalRule().run() },
        {
          label: "Blockquote",
          action: () => ed.chain().focus().toggleBlockquote().run(),
        },
      ],
    },
    {
      key: "format",
      label: "Format",
      entries: [
        { label: "Bold", shortcut: "⌘B", action: () => ed.chain().focus().toggleBold().run() },
        { label: "Italic", shortcut: "⌘I", action: () => ed.chain().focus().toggleItalic().run() },
        {
          label: "Underline",
          shortcut: "⌘U",
          action: () => ed.chain().focus().toggleUnderline().run(),
        },
        {
          label: "Strikethrough",
          action: () => ed.chain().focus().toggleStrike().run(),
        },
      ],
    },
    {
      key: "tools",
      label: "Tools",
      entries: [
        {
          label: "Summarize with AI",
          action: () => {
            document.dispatchEvent(new CustomEvent("synapse:open-ai-panel"));
          },
        },
      ],
    },
  ];

  return (
    <nav className="flex select-none items-center border-b border-slate-900/10 bg-white text-[13px] dark:border-white/10 dark:bg-slate-900">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-0.5 px-2 sm:px-6">
        {items.map((menu) => (
          <div key={menu.key} className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === menu.key ? null : menu.key)}
              onMouseEnter={() => openMenu && setOpenMenu(menu.key)}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10 ${
                openMenu === menu.key
                  ? "bg-slate-900/5 dark:bg-white/10"
                  : ""
              }`}
            >
              {menu.label}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {openMenu === menu.key && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setOpenMenu(null)}
                />
                <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-slate-900/10 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-800">
                  {menu.entries.map((entry) => (
                    <button
                      key={entry.label}
                      type="button"
                      onClick={() => {
                        entry.action();
                        setOpenMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[13px] transition hover:bg-slate-900/5 dark:hover:bg-white/10 ${
                        entry.danger
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {entry.label}
                      {entry.shortcut && (
                        <span className="text-xs text-slate-400">
                          {entry.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}

        <span className="ml-auto hidden pr-1 text-xs text-slate-400 dark:text-slate-500 sm:block">
          {wordCount.toLocaleString()} words
        </span>
      </div>
    </nav>
  );
}
