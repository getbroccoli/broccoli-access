import { DotsThree, X } from "@phosphor-icons/react";

import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetClose, SheetTitle } from "@/components/ui/sheet";
import { t } from "@/i18n";

import { Avatar } from "@/components/Avatar";

type Props = {
  employee: EmployeePanel_EmployeeFragment;
  onRemove: () => void;
};

/** A person's panel header: their photo and name, the ⋯ menu for admins, and Close. */
export function EmployeeHeader({ employee, onRemove }: Props) {
  const fullName = `${employee.firstName} ${employee.lastName}`;
  return (
    <header className="flex items-center gap-4 border-b border-border px-6 py-5">
      <Avatar
        url={employee.avatarUrl ?? null}
        firstName={employee.firstName}
        lastName={employee.lastName}
        className="size-14 text-lg"
      />
      <div className="min-w-0 flex-1">
        <SheetTitle className="truncate">{fullName}</SheetTitle>
      </div>
      {employee.access.canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={t("people.panel.more")} />}
          >
            <DotsThree weight="bold" />
          </DropdownMenuTrigger>
          {/* As wide as its item, not the trigger, so the name stays on one line. */}
          <DropdownMenuContent align="end" className="w-auto max-w-80">
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <span className="truncate">{t("people.panel.remove.menu", { name: fullName })}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <SheetClose
        render={<Button variant="ghost" size="icon" aria-label={t("people.panel.close")} />}
      >
        <X />
      </SheetClose>
    </header>
  );
}
