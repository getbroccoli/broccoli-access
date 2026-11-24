import { z } from "zod";

import { invalidInput } from "../../../core/applicationError";

/** A named list of apps that the owner assigns to people. */
export interface Template {
  id: string;
  /** Unique, ignoring case. */
  name: string;
  createdAt: Date;
  /** In the order they were added. */
  apps: TemplateApp[];
  /** How many employees have it. */
  peopleCount: number;
}

/** One app in one template. */
export interface TemplateApp {
  id: string;
  appId: string;
}

/** Template names are unique: another template already has this one, ignoring case. */
export class TemplateNameTakenError extends Error {
  constructor() {
    super("Another template already has this name");
    this.name = "TemplateNameTakenError";
  }
}

/** A template's name, trimmed; throws `INVALID_INPUT` on `name` when blank, null or too long. */
export function parseTemplateName(name: string | null): string {
  const result = templateName.safeParse(name);
  if (!result.success) {
    const tooLong = result.error.issues.some(({ code }) => code === "too_big");
    throw invalidInput([{ field: "name", code: tooLong ? "too_long" : "required" }]);
  }
  return result.data;
}

const NAME_MAX_LENGTH = 100;

const templateName = z.string().trim().min(1).max(NAME_MAX_LENGTH);
