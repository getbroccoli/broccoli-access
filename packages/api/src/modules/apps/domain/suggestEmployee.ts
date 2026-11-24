/** The one active employee whose name or email username matches best, or null for a tie or weak match. */
export function suggestEmployee(
  account: { email: string; displayName: string | null },
  employees: readonly { id: string; firstName: string; lastName: string; email: string }[],
): string | null {
  const accountNames = [normalise(account.displayName ?? ""), username(account.email)].filter(
    Boolean,
  );
  let best = 0;
  let suggestion: string | null = null;
  for (const person of employees) {
    const names = [normalise(person.firstName + person.lastName), username(person.email)];
    const score = Math.max(
      ...accountNames.flatMap((name) => names.map((other) => closeness(name, other))),
    );
    if (score > best) {
      best = score;
      suggestion = person.id;
    } else if (score === best) {
      suggestion = null;
    }
  }
  return suggestion;
}

function username(email: string): string {
  return normalise(email.split("@")[0]!);
}

function normalise(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Prefer an exact match. Allow one missing, extra or mistyped letter only in longer names. */
function closeness(one: string, other: string): number {
  if (one === other) return 2;
  if (
    Math.min(one.length, other.length) < MIN_TYPO_LENGTH ||
    Math.abs(one.length - other.length) > 1
  )
    return 0;
  const shorter = one.length <= other.length ? one : other;
  const longer = one.length <= other.length ? other : one;
  let index = 0;
  while (index < shorter.length && shorter[index] === longer[index]) index++;
  const skip = shorter.length === longer.length ? 1 : 0;
  return Number(shorter.slice(index + skip) === longer.slice(index + 1));
}

/** A one-letter difference in a short name is too weak to suggest a person. */
const MIN_TYPO_LENGTH = 5;
