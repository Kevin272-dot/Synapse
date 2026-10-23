"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, Loader2 } from "lucide-react";
import { generateJSON } from "@tiptap/core";
import DOMPurify from "dompurify";
import * as mammoth from "mammoth";
import { unzipSync } from "fflate";
import { createDocumentFromImport } from "@/lib/actions";
import { EDITOR_EXTENSIONS } from "@/lib/editor/extensions";

/**
 * Import an existing document (.docx from Google Docs export, .html, or .txt)
 * into Synapse. The file is read + converted + sanitized entirely in the
 * browser; the server action stores the resulting TipTap JSON.
 */
export function ImportDocumentButton({
  folderId,
  compact = false,
}: {
  folderId?: string | null;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setError(null);
    try {
      const lower = file.name.toLowerCase();
      const sourceType: "docx" | "html" | "txt" | "pptx" = lower.endsWith(".pptx")
        ? "pptx"
        : lower.endsWith(".docx")
          ? "docx"
          : lower.endsWith(".html") || lower.endsWith(".htm")
            ? "html"
            : "txt";
      const title = file.name.replace(/\.(docx|html?|txt|pptx)$/i, "");
      let html: string;

      if (sourceType === "docx") {
        const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        html = result.value;
      } else if (sourceType === "pptx") {
        // Slides are extracted client-side: the .pptx is a zip of XML slides.
        html = pptxToHtml(await file.arrayBuffer());
      } else if (sourceType === "html") {
        html = await file.text();
      } else {
        // .txt -> wrap in <p>
        const text = await file.text();
        html = text
          .split(/\n{2,}/)
          .map((p) => `<p>${escapeHtml(p)}</p>`)
          .join("");
      }

      // Strip scripts/event handlers/unknown tags — the XSS guard.
      const clean = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
      });

      // Convert sanitized HTML -> TipTap JSON using the same schema as the editor.
      const json = generateJSON(clean, EDITOR_EXTENSIONS);

      // Plain-text projection for the collab layer.
      const text = plainTextFromDoc(json);

      startTransition(() => {
        createDocumentFromImport({
          title,
          content: JSON.stringify(json),
          text,
          folderId: folderId ?? null,
          sourceType,
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import that file.");
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.html,.htm,.txt,.pptx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        className={
          compact
            ? "inline-flex h-9 items-center justify-center gap-2 rounded-full border border-slate-900/15 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-900/5 disabled:opacity-60 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
            : "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-900/15 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-900/5 disabled:opacity-60 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
        }
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        Import
      </button>
      {error && (
        <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 shadow dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

/** Recursively extract plain text from a TipTap JSON doc (blocks joined by \n). */
function plainTextFromDoc(node: unknown): string {
  if (typeof node !== "object" || node === null) return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return n.content.map(plainTextFromDoc).join(
      n.type && n.type !== "paragraph" && n.type !== "text" ? "\n" : ""
    );
  }
  return "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Extract slide text from a .pptx. A presentation is a zip of XML slides:
 * unzip it, read ppt/slides/slideN.xml in numeric order, and turn each slide's
 * text runs into an <h2> (title) followed by <p> lines. The result goes through
 * the same DOMPurify + generateJSON pipeline as every other import.
 */
function pptxToHtml(buffer: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buffer));

  const slidePaths = Object.keys(files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)\.xml$/)?.[1] ?? 0);
      const nb = Number(b.match(/(\d+)\.xml$/)?.[1] ?? 0);
      return na - nb;
    });

  if (slidePaths.length === 0) {
    throw new Error("No slides found in that presentation.");
  }

  const decoder = new TextDecoder("utf-8");
  const parser = new DOMParser();

  const slides = slidePaths.map((path, index) => {
    const xml = decoder.decode(files[path]);
    const doc = parser.parseFromString(xml, "application/xml");
    const runs = Array.from(doc.getElementsByTagName("a:t"))
      .map((n) => (n.textContent ?? "").trim())
      .filter(Boolean);
    if (runs.length === 0) return "";

    const [title, ...body] = runs;
    const heading = title || `Slide ${index + 1}`;
    return (
      `<h2>${escapeHtml(heading)}</h2>` +
      body.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
    );
  });

  const html = slides.filter(Boolean).join("");
  if (!html) throw new Error("That presentation has no extractable text.");
  return html;
}
