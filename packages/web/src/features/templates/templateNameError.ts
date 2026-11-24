import type { CreateTemplateMutation, RenameTemplateMutation } from "@/__generated__/graphql";
import { t } from "@/i18n";

/** A refused create or rename: the `error` of either payload. */
type NameRefusal =
  | CreateTemplateMutation["templates"]["create"]["error"]
  | RenameTemplateMutation["templates"]["update"]["error"];

/** Why a template's name was not saved, in words for its field; undefined when it was. */
export function templateNameError(refusal: NameRefusal, failedOtherwise: boolean) {
  const fields = refusal?.__typename === "InvalidInputError" ? refusal.fields : [];
  const code = fields.find(({ field }) => field === "name")?.code;
  if (code === "required" || code === "too_long" || code === "taken") {
    return t(NAME_ERRORS[code]);
  }
  return refusal || failedOtherwise ? t("templates.name.failed") : undefined;
}

const NAME_ERRORS = {
  required: "templates.name.required",
  too_long: "templates.name.tooLong",
  taken: "templates.name.taken",
} as const;
