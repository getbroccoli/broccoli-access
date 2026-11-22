/** Since when someone has had an account, or an app has had one: a date, or before a date. */
export interface Since {
  at: Date;
  /** The grant is older than the log, which began at `at`. */
  before: boolean;
}

/** What Since reads of an account. */
export interface AccountDates {
  grantedAt: Date | null;
  grantedBefore: Date | null;
  firstSeenAt: Date;
}

/** The account's `grantedAt`; otherwise before its `grantedBefore`; otherwise its `firstSeenAt`. */
export function accountSince({ grantedAt, grantedBefore, firstSeenAt }: AccountDates): Since {
  if (grantedAt) {
    return { at: grantedAt, before: false };
  }
  return grantedBefore ? { at: grantedBefore, before: true } : { at: firstSeenAt, before: false };
}

/** The earliest Since of the app's accounts, "before" winning a tie; null without accounts. */
export function appSince(accounts: readonly AccountDates[]): Since | null {
  return accounts
    .map(accountSince)
    .reduce<Since | null>(
      (earliest, since) => (earliest && !isEarlier(since, earliest) ? earliest : since),
      null,
    );
}

function isEarlier(since: Since, other: Since): boolean {
  const difference = since.at.getTime() - other.at.getTime();
  return difference < 0 || (difference === 0 && since.before && !other.before);
}
