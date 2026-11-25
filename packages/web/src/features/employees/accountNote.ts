/** The longest note on a marked account the API accepts. */
export const ACCOUNT_NOTE_MAX_LENGTH = 500;

/**
 * Why the API would refuse a marked account's note: nothing to read, counting invisible characters
 * such as a zero-width space as nothing, or too long; null for a note it takes.
 */
export function accountNoteProblem(note: string): "blank" | "tooLong" | null {
  const trimmed = note.trim();
  if (trimmed.replace(UNREADABLE, "") === "") {
    return "blank";
  }
  return trimmed.length > ACCOUNT_NOTE_MAX_LENGTH ? "tooLong" : null;
}

/** Whitespace and Unicode format characters (`Cf`), which show nothing by themselves. */
const UNREADABLE = /[\s\p{Cf}]/gu;
