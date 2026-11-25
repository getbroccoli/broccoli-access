import { useState } from "react";

import type { AccountChangeAction } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { DoneByHandDialog } from "./DoneByHandDialog";

type Props = {
  /** The change that waits for the owner, in an app without a connection. */
  change: { id: string; action: AccountChangeAction };
  employee: { firstName: string; lastName: string };
  app: string;
};

/** "By hand" on an app without a connection: asks whether the owner gave it themselves. */
export function ByHandButton({ change, employee, app }: Props) {
  const [open, setOpen] = useState(false);
  const name = `${employee.firstName} ${employee.lastName}`;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={t("apps.change.byHandName", { name, app })}
        onClick={() => setOpen(true)}
      >
        {t("apps.change.byHand")}
      </Button>
      <DoneByHandDialog
        open={open}
        onClose={() => setOpen(false)}
        change={change}
        person={{ name, firstName: employee.firstName }}
        app={app}
        connected={false}
      />
    </>
  );
}
