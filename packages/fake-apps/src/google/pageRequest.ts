import { z } from "zod";

import { adminMethodRules, type AdminMethod } from "./adminMethods";

export interface PageRequest {
  maxResults: number;
  /** How many items earlier pages held; the page token carries it. */
  offset: number;
}

/** The page a list call asks for, within the method's bounds; undefined when Google refuses it. */
export function parsePageRequest(query: unknown, method: AdminMethod): PageRequest | undefined {
  const bounds = adminMethodRules(method).maxResults;
  if (bounds === undefined) throw new Error(`${method} is not a list method`);
  const parsed = z
    .object({
      maxResults: z.coerce.number().int().min(bounds.minimum).max(bounds.maximum).optional(),
      pageToken: z.string().optional(),
    })
    .safeParse(query);
  if (!parsed.success) return undefined;
  const offset = parsed.data.pageToken === undefined ? 0 : pageTokenOffset(parsed.data.pageToken);
  if (offset === undefined) return undefined;
  return { maxResults: parsed.data.maxResults ?? bounds.default, offset };
}

/** One page of `items`, with an opaque token to the next while more remain. */
export function pageOf<T>(items: T[], { maxResults, offset }: PageRequest) {
  const end = offset + maxResults;
  const nextPageToken =
    end < items.length ? Buffer.from(`o${end}`).toString("base64url") : undefined;
  return { items: items.slice(offset, end), nextPageToken };
}

function pageTokenOffset(pageToken: string): number | undefined {
  const match = /^o(\d+)$/.exec(Buffer.from(pageToken, "base64url").toString());
  return match?.[1] === undefined ? undefined : Number(match[1]);
}
