import { EditableField } from "@/features/records";
import { t } from "@/i18n";

import { EMPLOYEE_DESCRIPTION } from "./employeeDescription";
import type { EmployeeFieldKey } from "./employeeDraft";
import type { useEmployeeDraft } from "./useEmployeeDraft";

type Props = {
  draft: ReturnType<typeof useEmployeeDraft>;
  canEdit: (key: EmployeeFieldKey) => boolean;
};

/** The person's fields in their sections, each edited in place. */
export function EmployeeDetails({ draft, canEdit }: Props) {
  const fields = EMPLOYEE_DESCRIPTION.fields.filter((field) => !("historyOnly" in field));
  const sections = Map.groupBy(fields, (field) => field.section);

  return (
    <section aria-labelledby="employee-details" className="flex flex-col gap-2">
      <h2
        id="employee-details"
        className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
      >
        {t("people.panel.section.details")}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] items-start gap-4">
        {[...sections].map(([section, fields]) => (
          <section
            key={section}
            aria-label={section}
            className="overflow-hidden rounded-xl border border-border"
          >
            <h3 className="border-b border-border/60 bg-sidebar px-3 py-2 text-[13px] font-medium">
              {section}
            </h3>
            {fields.map((field) => {
              const key = field.key as EmployeeFieldKey;
              return (
                <EditableField
                  key={key}
                  field={field}
                  saved={draft.saved[key]}
                  draft={draft.draft[key]}
                  error={draft.fieldErrors[key]}
                  disabled={draft.saving}
                  readOnly={!canEdit(key)}
                  onEdit={(value) => draft.edit(key, value)}
                  onRevert={() => draft.revert(key)}
                />
              );
            })}
          </section>
        ))}
      </div>
    </section>
  );
}
