import { useState } from "react";
import { toast } from "sonner";
import { AddPersonAppDocument, PersonPageDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";
import { AddPersonAppOptions } from "./AddPersonAppOptions";

type Props = { employeeId: string };

/** "Add app": gives this person alone an approved app, with a role where its connector lists any. */
export function AddPersonAppMenu({ employeeId }: Props) {
  const [open, setOpen] = useState(false);
  const [add, { loading }] = usePayloadMutation(AddPersonAppDocument, {
    refetch: [PersonPageDocument],
  });
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" size="sm" disabled={loading} />}
      >
        {t("people.person.addApp")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
        {open && (
          <AddPersonAppOptions
            employeeId={employeeId}
            onAdd={(app, role) =>
              void add({ variables: { input: { employeeId, appId: app.id, role } } }).catch(() =>
                toast.error(t("people.person.addApp.failed", { app: app.name })),
              )
            }
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
