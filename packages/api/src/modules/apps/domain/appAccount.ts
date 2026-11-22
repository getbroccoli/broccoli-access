import type { AccountStatus } from "../../../core/connectors";
import type { FieldChange } from "../../../core/records";

/** One person's account in one app, as the sync keeps it. */
export interface AppAccount {
  id: string;
  appId: string;
  /** Lowercased. */
  email: string;
  employeeId: string | null;
  status: AccountStatus;
  /** The finding kinds whose last scan saw the account, such as `google_directory`. */
  foundVia: string[];
  firstSeenAt: Date;
}

/** An account a finding kind saw in its last scan. */
export interface FoundAccount {
  appId: string;
  email: string;
  status: AccountStatus;
  employeeId: string | null;
}

/** What one finding kind's scan changes in the accounts: new ones, changed ones and gone ones. */
export interface AccountSyncPlan {
  created: Omit<AppAccount, "id">[];
  updated: { before: AppAccount; after: AppAccount }[];
  /** Accounts no finding kind sees any more. */
  deleted: AppAccount[];
}

/**
 * Brings `known` accounts in line with what `findingKind` saw: a found account is created or takes
 * the found status and employee, and an account the kind no longer sees loses the kind, going
 * when no kind is left.
 */
export function planAccountSync(
  known: readonly AppAccount[],
  { findingKind, found, now }: { findingKind: string; found: readonly FoundAccount[]; now: Date },
): AccountSyncPlan {
  const knownByKey = new Map(known.map((account) => [accountKey(account), account]));
  const foundKeys = new Set(found.map(accountKey));
  const plan: AccountSyncPlan = { created: [], updated: [], deleted: [] };
  for (const account of found) {
    const before = knownByKey.get(accountKey(account));
    if (!before) {
      plan.created.push({ ...account, foundVia: [findingKind], firstSeenAt: now });
      continue;
    }
    const foundVia = before.foundVia.includes(findingKind)
      ? before.foundVia
      : [...before.foundVia, findingKind];
    plan.updated.push({ before, after: { ...before, ...account, foundVia } });
  }
  for (const before of known) {
    if (foundKeys.has(accountKey(before)) || !before.foundVia.includes(findingKind)) {
      continue;
    }
    const foundVia = before.foundVia.filter((kind) => kind !== findingKind);
    if (foundVia.length === 0) {
      plan.deleted.push(before);
    } else {
      plan.updated.push({ before, after: { ...before, foundVia } });
    }
  }
  plan.updated = plan.updated.filter(
    ({ before, after }) => accountChanges(before, after).length > 0,
  );
  return plan;
}

/** The fields history keeps of an account, from `before` to `after`; null for none. */
export function accountChanges(
  before: Omit<AppAccount, "id"> | null,
  after: Omit<AppAccount, "id"> | null,
): FieldChange[] {
  const fields = (account: Omit<AppAccount, "id"> | null) => ({
    email: account?.email ?? null,
    employee: account?.employeeId ?? null,
    status: account?.status ?? null,
    foundVia: account ? account.foundVia.join(", ") : null,
  });
  const old = fields(before);
  const current = fields(after);
  return HISTORY_FIELDS.flatMap((field) =>
    old[field] === current[field]
      ? []
      : [{ field, oldValue: old[field], newValue: current[field] }],
  );
}

/** The fields whose changes history keeps, in the order a history line lists them. */
const HISTORY_FIELDS = ["email", "employee", "status", "foundVia"] as const;

function accountKey({ appId, email }: { appId: string; email: string }): string {
  return `${appId} ${email}`;
}
