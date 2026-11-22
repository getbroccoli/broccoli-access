import { CaretDown, GearSix, Plant } from "@phosphor-icons/react";
import { Link, useRouteContext } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

import { useMenuFinalFocus } from "./useMenuFinalFocus";

/** The workspace menu: the product's name, and the actions on the whole workspace. */
export function WorkspaceMenu() {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const { onOpenChange, finalFocus } = useMenuFinalFocus();
  const name = t("app.name");
  const logo = (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
      <Plant size={16} weight="fill" aria-hidden />
    </span>
  );
  const canManage = me.operations.includes("MANAGE_WORKSPACE");

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="group/workspace flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-foreground/5 aria-expanded:bg-foreground/5"
          >
            {logo}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
              {name}
            </span>
            <CaretDown
              size={11}
              weight="bold"
              className="text-muted-foreground transition-transform group-aria-expanded/workspace:rotate-180"
            />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-60" finalFocus={finalFocus}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 px-2 py-2">
            {logo}
            <span className="truncate text-[13px] font-semibold text-foreground">{name}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to="/settings" />}>
              <GearSix size={14} />
              {t("settings.title")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
