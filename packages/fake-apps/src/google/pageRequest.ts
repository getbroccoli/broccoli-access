import { z } from "zod";

import { pageTokenOffset, type PageRequest } from "../utils";
import { adminMethodRules, type AdminMethod } from "./adminMethods";

/**
 * The page a list call asks for, within the method's bounds and at most `maxPageSize` items, as
 * Google may return fewer than asked; undefined when Google refuses it.
 */
export function parsePageRequest(
  query: unknown,
  method: AdminMethod,
  maxPageSize = Infinity,
): PageRequest | undefined {
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
  return { maxResults: Math.min(parsed.data.maxResults ?? bounds.default, maxPageSize), offset };
}
