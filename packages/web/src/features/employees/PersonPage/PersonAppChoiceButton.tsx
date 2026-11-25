import { X } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  PersonPageDocument,
  RemovePersonAppDocument,
  UndoPersonAppChoiceDocument,
  type PersonPageQuery,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Person = NonNullable<PersonPageQuery["employee"]>;
type Props = {
  row: Person["personApps"]["edges"][number]["node"];
  person: Pick<Person, "id" | "firstName">;
};

/** Undo on an app the owner added or removed for this person; else Remove on a template's app. */
export function PersonAppChoiceButton({ row, person }: Props) {
  const [remove, removing] = usePayloadMutation(RemovePersonAppDocument, {
    refetch: [PersonPageDocument],
  });
  const [undo, undoing] = usePayloadMutation(UndoPersonAppChoiceDocument, {
    refetch: [PersonPageDocument],
  });
  const input = { variables: { input: { employeeId: person.id, appId: row.app.id } } };
  const failed = () => toast.error(t("people.person.appChoiceFailed", { app: row.app.name }));
  if (row.choice)
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={undoing.loading}
        onClick={() => void undo(input).catch(failed)}
      >
        {t("people.person.undo")}
      </Button>
    );
  if (!row.templates.length) return null;
  const label = t("people.person.removeApp", { app: row.app.name, person: person.firstName });
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0 rounded-full"
      disabled={removing.loading}
      aria-label={label}
      title={label}
      onClick={() => void remove(input).catch(failed)}
    >
      <X size={12} />
    </Button>
  );
}
