import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { FontSize } from "@/components/editor/font-size";

/**
 * The single source of truth for editor extensions. Used both by the live
 * editor (useEditor) and by generateJSON/generateHTML when parsing imported
 * HTML, so the parser and the editor always agree on the schema.
 */
export const EDITOR_EXTENSIONS = [
  StarterKit.configure({}),
  TextStyle,
  Color,
  FontFamily,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  FontSize,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  Image.configure({ inline: false, allowBase64: true }),
  Subscript,
  Superscript,
  Placeholder.configure({
    placeholder: "Start writing, or type '/' for commands…",
  }),
];
