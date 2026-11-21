import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";

/** The employee's fields, by panel section, as the panel and its history show them. */
export const EMPLOYEE_DESCRIPTION = {
  titleField: "firstName",
  fields: [
    // The panel edits the work email in its key facts, not among these sections.
    {
      key: "email",
      label: t("people.panel.field.email"),
      editor: "text",
      format: (value) => value,
      historyOnly: true,
    },
    textField("firstName"),
    textField("lastName"),
  ],
} satisfies RecordDescription;

function textField(key: "firstName" | "lastName"): RecordDescription["fields"][number] {
  return {
    key,
    label: t(`people.panel.field.${key}`),
    section: t("people.panel.section.personal"),
    editor: "text",
    format: (value) => value,
  };
}
