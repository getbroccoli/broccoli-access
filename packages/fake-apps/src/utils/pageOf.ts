/** Which page a list call asks for. */
export interface PageRequest {
  maxResults: number;
  /** How many items earlier pages held; the page token carries it. */
  offset: number;
}

/** One page of `items`, with an opaque token to the next while more remain. */
export function pageOf<T>(items: T[], { maxResults, offset }: PageRequest) {
  const end = offset + maxResults;
  const nextPageToken =
    end < items.length ? Buffer.from(`o${end}`).toString("base64url") : undefined;
  return { items: items.slice(offset, end), nextPageToken };
}

/** The offset a token from `pageOf` carries; undefined for any other text. */
export function pageTokenOffset(pageToken: string): number | undefined {
  const match = /^o(\d+)$/.exec(Buffer.from(pageToken, "base64url").toString());
  return match?.[1] === undefined ? undefined : Number(match[1]);
}
