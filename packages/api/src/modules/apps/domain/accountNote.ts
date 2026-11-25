/** The longest note on a marked account: a line or two on what the account is for. */
export const ACCOUNT_NOTE_MAX_LENGTH = 500;

/**
 * The owner's note on a marked account, trimmed. Refuses one with nothing to read, counting
 * invisible format characters such as a zero-width space as nothing, and one over the limit.
 */
export function parseAccountNote(
  input: string,
): { note: string } | { problem: "required" | "too_long" } {
  const note = input.trim();
  if (note.replace(UNREADABLE, "") === "") {
    return { problem: "required" };
  }
  return note.length > ACCOUNT_NOTE_MAX_LENGTH ? { problem: "too_long" } : { note };
}

/** Whitespace and Unicode format characters (`Cf`), which show nothing by themselves. */
const UNREADABLE = /[\s\p{Cf}]/gu;
