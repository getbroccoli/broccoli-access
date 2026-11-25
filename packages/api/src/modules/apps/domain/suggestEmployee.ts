interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** Index directory employees once for a page. A key shared by two employees stays ambiguous. */
export function employeeMatcher(employees: readonly Person[]) {
  const exact = new Map<string, string | null>();
  const missingLetter = new Map<string, string | null>();
  const changedLetter = new Map<string, string | null>();
  for (const person of employees) {
    for (const name of new Set([
      normalise(person.firstName + person.lastName),
      username(person.email),
    ])) {
      if (!name) continue;
      index(exact, name, person.id);
      if (name.length < MIN_TYPO_LENGTH) continue;
      for (const { shorter, wildcard } of letterKeys(name)) {
        if (shorter.length >= MIN_TYPO_LENGTH) index(missingLetter, shorter, person.id);
        index(changedLetter, wildcard, person.id);
      }
    }
  }

  return ({ email, displayName }: { email: string; displayName: string | null }): string | null => {
    const names = new Set([normalise(displayName ?? ""), username(email)]);
    const matches = new Set<string | null | undefined>();
    for (const name of names) matches.add(exact.get(name));
    matches.delete(undefined);
    if (matches.size === 0) {
      for (const name of names) {
        if (name.length < MIN_TYPO_LENGTH) continue;
        matches.add(missingLetter.get(name));
        for (const { shorter, wildcard } of letterKeys(name)) {
          if (shorter.length >= MIN_TYPO_LENGTH) matches.add(exact.get(shorter));
          matches.add(changedLetter.get(wildcard));
        }
      }
      matches.delete(undefined);
    }
    return matches.size === 1 ? (matches.values().next().value ?? null) : null;
  };
}

function index(keys: Map<string, string | null>, key: string, id: string): void {
  keys.set(key, keys.has(key) && keys.get(key) !== id ? null : id);
}

/** Dropping one letter finds an insertion or deletion. Marking its position finds a substitution. */
function* letterKeys(name: string) {
  for (let i = 0; i < name.length; i++) {
    const start = name.slice(0, i);
    const end = name.slice(i + 1);
    yield { shorter: start + end, wildcard: start + "*" + end };
  }
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

/** A one-letter difference in a short name is too weak to suggest a person. */
const MIN_TYPO_LENGTH = 5;
