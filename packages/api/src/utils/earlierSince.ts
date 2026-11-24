/** The earlier date, with a known earlier-than bound winning an equal date. */
export function isEarlierSince(since: DateBound, other: DateBound): boolean {
  const difference = since.at.getTime() - other.at.getTime();
  return difference < 0 || (difference === 0 && since.before && !other.before);
}

interface DateBound {
  at: Date;
  before: boolean;
}
