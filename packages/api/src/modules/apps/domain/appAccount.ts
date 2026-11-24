import type { AccountStatus } from "../../../core/connectors";
import type { FieldChange } from "../../../core/records";

/** One person's account in one app, as the sync keeps it. */
export interface AppAccount {
  id: string;
  appId: string;
  /** Lowercased. */
  email: string;
  employeeId: string | null;
  employeeLinkedBy: "email" | "owner" | null;
  kind: "personal" | "service" | "external";
  note: string | null;
  status: AccountStatus;
  /** The finding kinds whose last scan saw the account, such as `google_directory`. */
  foundVia: string[];
  /** When the person granted access, from the source's log; null when the log lacked it. */
  grantedAt: Date | null;
  /** Set only when the grant was older than the log: the log's start when a scan first saw it. */
  grantedBefore: Date | null;
  firstSeenAt: Date;
}

/**
 * What tells whether an account is in its app. In an app whose connection has finished a scan, an
 * account only other-app finding kinds found, such as a Google sign-in, is not: that scan did not
 * return it. Elsewhere it is undecided, and every account counts as access.
 */
export interface InAppFacts {
  /** The apps whose connection has finished a scan. */
  scannedAppIds: readonly string[];
  /** The finding kinds that find accounts in apps other than their connection's, such as `google_sign_in`. */
  otherAppKinds: readonly string[];
}

/** An account a finding kind saw in its last scan. */
export interface FoundAccount {
  appId: string;
  email: string;
  status: AccountStatus;
  employeeId: string | null;
  grantedAt: Date | null;
  grantedBefore: Date | null;
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
 * when no kind is left. A known account in an app of `statusKeptIn` keeps its status: another
 * connection's records decide it; so does an account in `statusKeptFor`, which a change may have
 * changed after the scan read it. Two found grants of one person to one app are one account,
 * since the earlier. Grant dates are fixed when a scan first sees the account: a later scan only
 * moves `grantedAt` earlier, since a later event is a renewed consent, not the first grant.
 */
export function planAccountSync(
  known: readonly AppAccount[],
  {
    findingKind,
    found,
    now,
    statusKeptIn,
    statusKeptFor,
  }: {
    findingKind: string;
    found: readonly FoundAccount[];
    now: Date;
    statusKeptIn: ReadonlySet<string>;
    /** Accounts by id. */
    statusKeptFor: ReadonlySet<string>;
  },
): AccountSyncPlan {
  const knownByKey = new Map(known.map((account) => [accountKey(account), account]));
  const foundKeys = new Set(found.map(accountKey));
  const plan: AccountSyncPlan = { created: [], updated: [], deleted: [] };
  for (const account of foundOnce(found)) {
    const before = knownByKey.get(accountKey(account));
    if (!before) {
      plan.created.push(firstSeen(account, findingKind, now));
      continue;
    }
    plan.updated.push({
      before,
      after: foundAgain(before, account, { findingKind, statusKeptIn, statusKeptFor }),
    });
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
    grantedAt: account?.grantedAt?.toISOString() ?? null,
    grantedBefore: account?.grantedBefore?.toISOString() ?? null,
  });
  const old = fields(before);
  const current = fields(after);
  return HISTORY_FIELDS.flatMap((field) =>
    old[field] === current[field]
      ? []
      : [{ field, oldValue: old[field], newValue: current[field] }],
  );
}

/**
 * How many of an app's users still have access though the directory suspended them: their account
 * is `active` while their employee is in `suspendedInDirectory`.
 */
export function countSuspendedWithAccess(
  users: readonly Pick<AppAccount, "employeeId" | "status">[],
  suspendedInDirectory: ReadonlySet<string>,
): number {
  return new Set(
    users
      .filter(
        ({ employeeId, status }) =>
          status === "active" && employeeId !== null && suspendedInDirectory.has(employeeId),
      )
      .map(({ employeeId }) => employeeId),
  ).size;
}

/** The fields whose changes history keeps, in the order a history line lists them. */
const HISTORY_FIELDS = [
  "email",
  "employee",
  "status",
  "foundVia",
  "grantedAt",
  "grantedBefore",
] as const;

function firstSeen(account: FoundAccount, findingKind: string, now: Date): Omit<AppAccount, "id"> {
  return {
    ...account,
    ...emailLink(account.employeeId),
    kind: "personal",
    note: null,
    foundVia: [findingKind],
    firstSeenAt: now,
  };
}

/** A known account as a scan of `findingKind` found it again. */
function foundAgain(
  before: AppAccount,
  account: FoundAccount,
  {
    findingKind,
    statusKeptIn,
    statusKeptFor,
  }: {
    findingKind: string;
    statusKeptIn: ReadonlySet<string>;
    statusKeptFor: ReadonlySet<string>;
  },
): AppAccount {
  const keepsStatus = statusKeptIn.has(before.appId) || statusKeptFor.has(before.id);

  return {
    ...before,
    status: keepsStatus ? before.status : account.status,
    ...(before.employeeLinkedBy === "owner"
      ? {}
      : emailLink(before.kind === "personal" ? account.employeeId : null)),
    foundVia: before.foundVia.includes(findingKind)
      ? before.foundVia
      : [...before.foundVia, findingKind],
    grantedAt: earlierGrant(before.grantedAt, account.grantedAt),
  };
}

function emailLink(employeeId: string | null) {
  return { employeeId, employeeLinkedBy: employeeId ? ("email" as const) : null };
}

/** The found accounts, once each. */
function foundOnce(found: readonly FoundAccount[]): FoundAccount[] {
  const byKey = new Map<string, FoundAccount>();
  for (const account of found) {
    const seen = byKey.get(accountKey(account));
    byKey.set(accountKey(account), seen ? mergedAccount(seen, account) : account);
  }
  return [...byKey.values()];
}

/** One account from two grants: active when either is, and undated when either is older than the log. */
function mergedAccount(one: FoundAccount, other: FoundAccount): FoundAccount {
  const grantedBefore = earliest(one.grantedBefore, other.grantedBefore);
  return {
    ...one,
    status: one.status === "active" ? one.status : other.status,
    grantedAt: grantedBefore ? null : earliest(one.grantedAt, other.grantedAt),
    grantedBefore,
  };
}

function earliest(one: Date | null, other: Date | null): Date | null {
  return one && other ? (one < other ? one : other) : (one ?? other);
}

/** The known grant date, or the found one when earlier; an undated account stays undated. */
function earlierGrant(known: Date | null, found: Date | null): Date | null {
  return known && earliest(known, found);
}

// shortcut: an app email change is a new account; follow renames if sync gains stable member identity.
function accountKey({ appId, email }: { appId: string; email: string }): string {
  return `${appId} ${email}`;
}
