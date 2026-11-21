import { useBlocker, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { EditBar, FieldValue } from "@/features/records";
import { t } from "@/i18n";

import { DiscardChangesDialog } from "./DiscardChangesDialog";
import { EmployeeDetails } from "./EmployeeDetails";
import { EmployeeHeader } from "./EmployeeHeader";
import { EmployeeHistory } from "./EmployeeHistory";
import { EMPLOYEE_DESCRIPTION } from "./employeeDescription";
import type { EmployeeFieldKey } from "./employeeDraft";
import { KeyFacts } from "./KeyFacts";
import { RemoveEmployeeDialog } from "./RemoveEmployeeDialog";
import { useEmployeeDraft } from "./useEmployeeDraft";

type Props = {
  employee: EmployeePanel_EmployeeFragment;
  onClose: () => void;
};

/**
 * One loaded person in their panel: header, then tabs for an overview of fields edited in place
 * with one Save, and their history. Leaving with unsaved changes asks first.
 */
export function EmployeeRecord({ employee, onClose }: Props) {
  const draft = useEmployeeDraft(employee);
  const unsaved = draft.changed.length > 0;
  const [removing, setRemoving] = useState(false);
  // Set once the employee is removed, so closing their panel asks nothing.
  const removed = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => !removed.current && unsaved,
    enableBeforeUnload: () => !removed.current && unsaved,
    withResolver: true,
  });
  // A save can finish while navigation is already waiting for the discard decision.
  useEffect(() => {
    if (blocker.status === "blocked" && !unsaved) blocker.proceed();
  }, [blocker, unsaved]);
  const fullName = `${employee.firstName} ${employee.lastName}`;
  const { tab } = useSearch({ from: "/_authenticated/people/$employeeId" });
  const navigate = useNavigate({ from: "/people/$employeeId" });
  const editable = new Set(employee.access.editableFields);
  const canEdit = (key: EmployeeFieldKey) => editable.has(key);
  // In panel order, as the person reads the fields.
  const changedLabels = EMPLOYEE_DESCRIPTION.fields
    .filter((field) => draft.changed.includes(field.key as EmployeeFieldKey))
    .map((field) => field.label);

  return (
    <>
      <EmployeeHeader employee={employee} onRemove={() => setRemoving(true)} />

      <Tabs
        value={tab}
        onValueChange={(value: typeof tab) =>
          void navigate({ search: (previous) => ({ ...previous, tab: value }) })
        }
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList aria-label={t("people.panel.tabs", { name: fullName })} className="px-6 pt-1">
          <TabsTab value="overview" className="pt-2">
            {t("people.panel.tab.overview")}
          </TabsTab>
          <TabsTab value="history" className="pt-2">
            {t("people.panel.tab.history")}
          </TabsTab>
        </TabsList>
        <TabsPanel
          value="overview"
          className="subtle-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6"
        >
          <KeyFacts
            email={
              <FieldValue
                field={EMAIL_FIELD}
                saved={draft.saved.email}
                draft={draft.draft.email}
                error={draft.fieldErrors.email}
                disabled={draft.saving}
                readOnly={!canEdit("email")}
                onEdit={(value) => draft.edit("email", value)}
                onRevert={() => draft.revert("email")}
              />
            }
            emailMark={
              draft.fieldErrors.email
                ? "invalid"
                : draft.changed.includes("email")
                  ? "changed"
                  : null
            }
          />
          <EmployeeDetails draft={draft} canEdit={canEdit} />
        </TabsPanel>
        <TabsPanel value="history" className="subtle-scrollbar flex-1 overflow-y-auto px-6 py-6">
          <EmployeeHistory employeeId={employee.id} />
        </TabsPanel>
      </Tabs>

      {unsaved && (
        <div className="border-t border-border px-4 py-3">
          <EditBar
            changedLabels={changedLabels}
            reason={draft.reason}
            onReasonChange={draft.setReason}
            saving={draft.saving}
            failureMessage={
              draft.failure &&
              t(draft.failure === "removed" ? "people.panel.saveRemoved" : "records.edit.failed")
            }
            onCancel={draft.cancel}
            onSave={() => void draft.save()}
          />
        </div>
      )}

      <DiscardChangesDialog
        open={blocker.status === "blocked"}
        count={draft.changed.length}
        name={fullName}
        // Navigation goes on once nothing is changed; a tab switch keeps the record open.
        onDiscard={draft.cancel}
        onKeepEditing={() => blocker.reset?.()}
      />
      <RemoveEmployeeDialog
        open={removing}
        onOpenChange={setRemoving}
        employee={employee}
        onRemoved={() => {
          removed.current = true;
          onClose();
        }}
      />
    </>
  );
}

const EMAIL_FIELD = EMPLOYEE_DESCRIPTION.fields.find((field) => field.key === "email")!;
