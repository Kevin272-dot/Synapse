"use client";

import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Baseline,
  Highlighter,
  Pilcrow,
  ChevronDown,
  Link2,
  RemoveFormatting,
} from "lucide-react";

type ToolbarProps = { editor: Editor | null };

const TEXT_COLORS = [
  { name: "Default", value: "#1f2937" },
  { name: "Charcoal", value: "#0f172a" },
  { name: "Gray", value: "#6b7280" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Amber", value: "#d97706" },
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Pink", value: "#db2777" },
];

const HIGHLIGHT_COLORS = [
  { name: "None", value: null },
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Orange", value: "#fed7aa" },
];

const FONT_SIZES = [
  "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px",
];

const FONT_FAMILIES = [
  { name: "Sans", value: "ui-sans-serif, system-ui, sans-serif" },
  { name: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { name: "Mono", value: "ui-monospace, 'Cascadia Mono', monospace" },
  { name: "Arial", value: "Arial, Helvetica, sans-serif" },
  { name: "Calibri", value: "Calibri, 'Segoe UI', sans-serif" },
  { name: "Times", value: "'Times New Roman', Times, serif" },
  { name: "Courier", value: "'Courier New', Courier, monospace" },
];

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-900/5 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100 ${
        active
          ? "bg-slate-900/10 text-slate-900 dark:bg-white/15 dark:text-white"
          : ""
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-slate-900/10 dark:bg-white/10" />;
}

function Popover({
  trigger,
  children,
  align = "left",
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger(open)}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-40 mt-1 max-h-80 overflow-auto rounded-lg border border-slate-900/10 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-slate-800 ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

export default function EditorToolbar({ editor }: ToolbarProps) {
  const [color, setColor] = useState<string>(TEXT_COLORS[0].value);
  const [linkUrl, setLinkUrl] = useState("");

  // Live editor state: re-renders the toolbar when the selection changes.
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const current = ctx.editor;
      if (!current) return null;
      const textStyle = current.getAttributes("textStyle");
      return {
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        h1: current.isActive("heading", { level: 1 }),
        h2: current.isActive("heading", { level: 2 }),
        h3: current.isActive("heading", { level: 3 }),
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        code: current.isActive("code"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        blockquote: current.isActive("blockquote"),
        alignLeft: current.isActive({ textAlign: "left" }),
        alignCenter: current.isActive({ textAlign: "center" }),
        alignRight: current.isActive({ textAlign: "right" }),
        fontSize: (textStyle.fontSize as string) ?? null,
        fontFamily: (textStyle.fontFamily as string) ?? null,
        isLink: current.isActive("link"),
      };
    },
  });

  if (!editor || !state) return null;
  const ed = editor;
  const st = state; // non-null for closures

  const sizeLabel = state.fontSize
    ? state.fontSize.replace("px", "")
    : "Default";
  const familyLabel = state.fontFamily
    ? FONT_FAMILIES.find((f) => f.value === state.fontFamily)?.name ?? "Font"
    : "Font";

  function toggleLink() {
    const url = linkUrl.trim() || "https://";
    if (st.isLink) {
      ed.chain().focus().unsetLink().run();
    } else {
      ed.chain().focus().setLink({ href: url }).run();
    }
    setLinkUrl("");
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 py-1.5">
      {/* Undo / Redo */}
      <ToolbarButton
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => ed.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => ed.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      {/* Font family */}
      <Popover
        trigger={() => (
          <button
            type="button"
            title="Font"
            className="mx-0.5 inline-flex h-8 max-w-[8rem] items-center gap-1 rounded-md px-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <span className="truncate">{familyLabel}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>
        )}
      >
        {(close) => (
          <div className="flex flex-col">
            {FONT_FAMILIES.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => {
                  ed.chain().focus().setFontFamily(f.value).run();
                  close();
                }}
                className={`rounded px-3 py-1.5 text-left hover:bg-slate-900/5 dark:hover:bg-white/10 ${
                  state.fontFamily === f.value
                    ? "bg-slate-900/10 dark:bg-white/15"
                    : ""
                }`}
                style={{ fontFamily: f.value }}
              >
                {f.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                ed.chain().focus().unsetFontFamily().run();
                close();
              }}
              className="rounded px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
            >
              Default
            </button>
          </div>
        )}
      </Popover>

      {/* Font size — shows size at the cursor, live */}
      <Popover
        trigger={() => (
          <button
            type="button"
            title="Font size"
            className="mx-0.5 inline-flex h-8 min-w-[4rem] items-center justify-center gap-1 rounded-md px-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            {sizeLabel}
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      >
        {(close) => (
          <div className="flex flex-col">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  ed.chain().focus().setFontSize(size).run();
                  close();
                }}
                className={`rounded px-3 py-1 text-left hover:bg-slate-900/5 dark:hover:bg-white/10 ${
                  state.fontSize === size
                    ? "bg-slate-900/10 font-medium dark:bg-white/15"
                    : ""
                }`}
                style={{ fontSize: size }}
              >
                {size}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                ed.chain().focus().unsetFontSize().run();
                close();
              }}
              className="rounded px-3 py-1 text-left text-sm text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
            >
              Default
            </button>
          </div>
        )}
      </Popover>

      <Divider />

      {/* Headings */}
      <ToolbarButton
        label="Heading 1"
        active={state.h1}
        onClick={() => ed.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={state.h2}
        onClick={() => ed.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={state.h3}
        onClick={() => ed.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      {/* Bold / italic / underline / strike / code */}
      <ToolbarButton
        label="Bold"
        active={state.bold}
        onClick={() => ed.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={state.italic}
        onClick={() => ed.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={state.underline}
        onClick={() => ed.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={state.strike}
        onClick={() => ed.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        active={state.code}
        onClick={() => ed.chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      {/* Link */}
      <Popover
        align="right"
        trigger={() => (
          <button
            type="button"
            title="Insert link"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10 ${
              state.isLink
                ? "bg-slate-900/10 text-slate-900 dark:bg-white/15 dark:text-white"
                : ""
            }`}
          >
            <Link2 className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <div className="flex flex-col gap-1 p-1">
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  toggleLink();
                  close();
                }
              }}
              placeholder="https://…"
              className="w-56 rounded-md border border-slate-900/10 bg-transparent px-2 py-1 text-sm text-foreground outline-none dark:border-white/15"
            />
            <button
              type="button"
              onClick={() => {
                toggleLink();
                close();
              }}
              className="rounded-md bg-slate-900 px-2 py-1 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
            >
              {state.isLink ? "Remove link" : "Apply"}
            </button>
          </div>
        )}
      </Popover>

      {/* Text color */}
      <Popover
        align="right"
        trigger={() => (
          <button
            type="button"
            title="Text color"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <span className="relative">
              <Baseline className="h-4 w-4" />
              <span
                className="absolute -bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full"
                style={{ background: color }}
              />
            </span>
          </button>
        )}
      >
        {(close) => (
          <div className="grid grid-cols-5 gap-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                aria-label={c.name}
                onClick={() => {
                  setColor(c.value);
                  ed.chain().focus().setColor(c.value).run();
                  close();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-900/10 hover:scale-110 dark:border-white/10"
                style={{ background: c.value }}
              />
            ))}
          </div>
        )}
      </Popover>

      {/* Highlight */}
      <Popover
        align="right"
        trigger={() => (
          <button
            type="button"
            title="Highlight color"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <Highlighter className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <div className="grid grid-cols-3 gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                onClick={() => {
                  if (c.value) {
                    ed
                      .chain()
                      .focus()
                      .toggleHighlight({ color: c.value })
                      .run();
                  } else {
                    ed.chain().focus().unsetHighlight().run();
                  }
                  close();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-900/10 hover:scale-110 dark:border-white/10"
                style={c.value ? { background: c.value } : undefined}
              >
                {!c.value && (
                  <Pilcrow className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>
            ))}
          </div>
        )}
      </Popover>

      <Divider />

      {/* Alignment */}
      <ToolbarButton
        label="Align left"
        active={state.alignLeft}
        onClick={() => ed.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Align center"
        active={state.alignCenter}
        onClick={() => ed.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        active={state.alignRight}
        onClick={() => ed.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      {/* Lists & blocks */}
      <ToolbarButton
        label="Bullet list"
        active={state.bulletList}
        onClick={() => ed.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={state.orderedList}
        onClick={() => ed.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Blockquote"
        active={state.blockquote}
        onClick={() => ed.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Horizontal rule"
        onClick={() => ed.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      {/* Clear formatting */}
      <ToolbarButton
        label="Clear formatting"
        onClick={() => ed.chain().focus().clearNodes().unsetAllMarks().run()}
      >
        <RemoveFormatting className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
