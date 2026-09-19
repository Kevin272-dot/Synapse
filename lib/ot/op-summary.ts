import type { Operation } from "./engine";

export interface OperationSummary {
  /** Human-readable, e.g. 'inserted 12 characters at position 40'. */
  summary: string;
  insertedChars: number;
  insertedText: string;
  deletedChars: number;
  /** Highest position the op touched (start of first change). */
  position: number;
}

/**
 * Renders an OT operation as a human-readable audit line.
 * Pure function — shared by the server action and the client UI.
 */
export function summarizeOperation(op: Operation): OperationSummary {
  let insertedChars = 0;
  let insertedText = "";
  let deletedChars = 0;
  let position = -1;
  let cursor = 0;

  for (const c of op) {
    if ("retain" in c) {
      cursor += c.retain;
    } else if ("insert" in c) {
      if (position === -1) position = cursor;
      insertedChars += c.insert.length;
      if (insertedText.length < 40) insertedText += c.insert;
    } else {
      if (position === -1) position = cursor;
      deletedChars += c.delete;
      cursor += c.delete;
    }
  }

  const parts: string[] = [];
  if (insertedChars > 0) {
    parts.push(
      insertedText && insertedText.length <= 20
        ? `inserted "${insertedText}"`
        : `inserted ${insertedChars} character${insertedChars === 1 ? "" : "s"}`
    );
  }
  if (deletedChars > 0) {
    parts.push(
      `deleted ${deletedChars} character${deletedChars === 1 ? "" : "s"}`
    );
  }

  return {
    summary:
      parts.length > 0
        ? `${parts.join(" and ")} at position ${Math.max(0, position)}`
        : "no visible change",
    insertedChars,
    insertedText,
    deletedChars,
    position: Math.max(0, position),
  };
}
