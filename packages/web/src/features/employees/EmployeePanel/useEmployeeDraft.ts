import { useRef, useState } from "react";

import {
  UpdateEmployeeDocument,
  type UpdateEmployeeMutation,
  type EmployeePanel_EmployeeFragment,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { addHistoryLine } from "@/features/records";
import { t, type MessageKey } from "@/i18n";

import {
  changedFields,
  type EmployeeFieldKey,
  type EmployeeValues,
  toUpdateInput,
} from "./employeeDraft";

/** Why the last save failed, for the edit bar: a removed employee or any other failure. */
export type SaveFailure = "removed" | "failed";

/**
 * The panel's unsaved edits of one employee: the changed values, the reason, and one save for
 * all of them. A refused or failed save keeps every edit.
 */
export function useEmployeeDraft(employee: EmployeePanel_EmployeeFragment) {
  const saved = valuesOf(employee);
  const { edits, setEdits, edit, revert } = useEdits();
  const [reason, setReason] = useState("");
  const { saving, failure, reset, saveChanges } = useSaveEmployee(employee.id);
  const draft = mapEdits(edits, ({ value }) => value);
  const fieldErrors = mapEdits(edits, ({ error }) => error);
  const changed = changedFields(saved, draft);

  const cancel = () => {
    setEdits({});
    setReason("");
    reset();
  };

  const save = async () => {
    // The draft is what gets saved, so it stays still until the save ends.
    if (saving) return;
    setEdits((current) => mapEdits(current, ({ value }) => ({ value })));
    try {
      if (!(await saveChanges(saved, draft, reason))) return;
      cancel();
    } catch (failed) {
      const messages = refusedFieldMessages(failed);
      if (!messages) return;
      setEdits((current) =>
        mapEdits(current, ({ value }, key) => ({ value, error: messages.get(key) })),
      );
    }
  };

  return {
    saved,
    draft,
    changed,
    reason,
    setReason,
    fieldErrors,
    failure,
    saving,
    edit,
    revert,
    cancel,
    save,
  };
}

/**
 * Saves an employee's changed fields. A refused save rejects with a `PayloadFailure`.
 * Discarded saves finish their writes but return false, without affecting the current draft.
 */
function useSaveEmployee(employeeId: string) {
  const [updateEmployee] = usePayloadMutation(UpdateEmployeeDocument, {
    // The saved employee updates in the cache by itself; its new line joins its history.
    update: (cache, { data }) => {
      const line = data?.employees.update.historyLine;
      if (line) addHistoryLine(cache, { recordType: "EMPLOYEE", recordId: employeeId, line });
    },
  });
  const [state, setState] = useState<{ saving: boolean; failure: SaveFailure | null }>({
    saving: false,
    failure: null,
  });
  // Only the current save may update the draft.
  const latestSave = useRef(0);
  return {
    ...state,
    reset: () => {
      latestSave.current++;
      setState({ saving: false, failure: null });
    },
    saveChanges: async (saved: EmployeeValues, draft: Partial<EmployeeValues>, reason: string) => {
      const thisSave = ++latestSave.current;
      let failure: SaveFailure | null = null;
      setState({ saving: true, failure: null });
      try {
        await updateEmployee({
          variables: { input: toUpdateInput(employeeId, saved, draft, reason) },
        });
        return thisSave === latestSave.current;
      } catch (failed) {
        if (thisSave !== latestSave.current) return false;
        const refused =
          failed instanceof PayloadFailure ? (failed.payloadError as SaveError) : null;
        failure =
          refused?.__typename === "NotFoundError"
            ? "removed"
            : refused?.__typename === "InvalidInputError"
              ? null
              : "failed";
        throw failed;
      } finally {
        if (thisSave === latestSave.current) setState({ saving: false, failure });
      }
    },
  };
}

/** The unsaved fields, with an edit that replaces one and a revert that drops it. */
function useEdits() {
  const [edits, setEdits] = useState<Edits>({});
  // A new value replaces the field's edit, and with it the error the last save gave it.
  const edit = (key: EmployeeFieldKey, value: string) =>
    setEdits((current) => ({ ...current, [key]: { value } }));
  const revert = (key: EmployeeFieldKey) =>
    setEdits((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  return { edits, setEdits, edit, revert };
}

/** The unsaved fields: each new value, and why the last save refused it until it changes. */
type Edits = Partial<Record<EmployeeFieldKey, { value: string; error?: string }>>;

function mapEdits<Result>(
  edits: Edits,
  map: (edit: { value: string; error?: string }, key: EmployeeFieldKey) => Result,
): Partial<Record<EmployeeFieldKey, Result>> {
  return Object.fromEntries(
    Object.entries(edits).map(([key, edit]) => [key, map(edit, key as EmployeeFieldKey)]),
  );
}

function valuesOf({ firstName, lastName, email }: EmployeePanel_EmployeeFragment): EmployeeValues {
  return { firstName, lastName, email };
}

/** Each refused field's message by its draft field, or null when the save failed otherwise. */
function refusedFieldMessages(failed: unknown): Map<string, string> | null {
  const refused = failed instanceof PayloadFailure ? (failed.payloadError as SaveError) : null;
  if (refused?.__typename !== "InvalidInputError") return null;
  return new Map(
    refused.fields.map(({ field, code }) => [
      field,
      t(FIELD_MESSAGES[code] ?? "people.panel.error.invalid"),
    ]),
  );
}

type SaveError = UpdateEmployeeMutation["employees"]["update"]["error"];

const FIELD_MESSAGES: Partial<Record<string, MessageKey>> = {
  required: "people.panel.error.required",
  too_long: "people.panel.error.tooLong",
  taken: "people.panel.error.taken",
};
