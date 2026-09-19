import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
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
];
