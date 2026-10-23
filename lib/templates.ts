/**
 * Curated note templates.
 *
 * Each template is a real TipTap/ProseMirror JSON document plus metadata.
 * The dashboard gallery turns one into an actual document through
 * createDocumentFromTemplate (lib/actions.ts), so the editor opens with a
 * sensible skeleton instead of an empty page.
 *
 * Keep the nodes to what StarterKit provides (paragraph, heading, lists,
 * blockquote) so the content is guaranteed to load in the editor.
 */

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  /** Accent colour used by the miniature page preview in the gallery. */
  accent: string;
  /** Document title created from this template. */
  title: string;
  /** The TipTap document that seeds the editor. */
  content: DocNode;
}

const doc = (nodes: DocNode[]): DocNode => ({ type: "doc", content: nodes });

const h2 = (text: string): DocNode => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});

const p = (text = ""): DocNode =>
  text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };

const bullets = (items: string[]): DocNode => ({
  type: "bulletList",
  content: items.map((text) => ({ type: "listItem", content: [p(text)] })),
});

const numbered = (items: string[]): DocNode => ({
  type: "orderedList",
  content: items.map((text) => ({ type: "listItem", content: [p(text)] })),
});

const quote = (text: string): DocNode => ({
  type: "blockquote",
  content: [p(text)],
});

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "meeting",
    name: "Meeting notes",
    description: "Agenda, decisions and action items for a meeting.",
    accent: "#1a73e8",
    title: "Meeting notes",
    content: doc([
      p("Date: "),
      p("Attendees: "),
      h2("Agenda"),
      bullets(["", "", ""]),
      h2("Decisions"),
      bullets(["", ""]),
      h2("Action items"),
      bullets(["Owner - task - due date", "Owner - task - due date"]),
      h2("Notes"),
      p(""),
    ]),
  },
  {
    id: "class",
    name: "Class notes",
    description: "Structured lecture notes with key ideas and open questions.",
    accent: "#188038",
    title: "Class notes",
    content: doc([
      p("Course: "),
      p("Date: "),
      p("Topic: "),
      h2("Key ideas"),
      bullets(["", "", ""]),
      h2("Definitions"),
      bullets(["Term - definition"]),
      h2("Worked example"),
      p(""),
      h2("Questions to resolve"),
      bullets(["", ""]),
    ]),
  },
  {
    id: "project",
    name: "Project plan",
    description: "Objective, scope, milestones, risks and owners.",
    accent: "#e8710a",
    title: "Project plan",
    content: doc([
      h2("Objective"),
      p("What does success look like, in one or two sentences?"),
      h2("Scope"),
      bullets(["In scope: ", "Out of scope: "]),
      h2("Milestones"),
      numbered(["", "", ""]),
      h2("Risks"),
      bullets(["Risk - impact - mitigation"]),
      h2("Owners"),
      bullets(["Area - owner"]),
    ]),
  },
  {
    id: "research",
    name: "Research notes",
    description: "Question, sources, findings and next steps.",
    accent: "#9334e6",
    title: "Research notes",
    content: doc([
      h2("Research question"),
      p("State the question you are trying to answer."),
      h2("Sources"),
      bullets(["", ""]),
      h2("Findings"),
      bullets(["", "", ""]),
      h2("Quotes"),
      quote("Paste a quote you might cite, with its source."),
      h2("Next steps"),
      bullets(["", ""]),
    ]),
  },
  {
    id: "journal",
    name: "Daily journal",
    description: "A short daily entry: focus, wins and reflection.",
    accent: "#d93025",
    title: "Daily journal",
    content: doc([
      p("Date: "),
      h2("Focus for today"),
      p(""),
      h2("What happened"),
      p(""),
      h2("Wins"),
      bullets(["", ""]),
      h2("Reflection"),
      p("What would you do differently?"),
    ]),
  },
];

export function getTemplate(id: string): NoteTemplate | undefined {
  return NOTE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Plain-text projection of a TipTap document, used for Document.text so the
 * OT engine, search and the knowledge-graph pipeline all see the template body.
 */
export function docToPlainText(node: DocNode): string {
  const inline = (n: DocNode): string =>
    n.text ?? (n.content ?? []).map(inline).join("");

  const lines: string[] = [];
  for (const block of node.content ?? []) {
    if (block.type === "bulletList" || block.type === "orderedList") {
      for (const item of block.content ?? []) {
        const text = (item.content ?? []).map(inline).join(" ").trim();
        lines.push(`${block.type === "bulletList" ? "-" : "1."} ${text}`);
      }
      continue;
    }
    const text = inline(block).trim();
    if (text) lines.push(text);
  }
  return lines.join("\n\n");
}
