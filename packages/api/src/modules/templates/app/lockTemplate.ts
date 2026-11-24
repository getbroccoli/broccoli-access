import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { parseUuid } from "../../../utils";
import { templateRepository } from "../db";

/** Serialises edits to one template; refuses an unknown or malformed id. */
export async function lockTemplate(tx: Tx, templateId: string) {
  const id = parseUuid(templateId);
  const template = id && (await templateRepository(tx).lockById(id));
  if (!template) throw new ApplicationError("NOT_FOUND", "No template has this id.");
  return template;
}
