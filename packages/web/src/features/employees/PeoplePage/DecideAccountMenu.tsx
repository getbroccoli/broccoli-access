import { CaretDown } from "@phosphor-icons/react";

import type { AccountChangeAction, MarkedAccountKind } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

export type AccountDecision = "link" | MarkedAccountKind | "SUSPEND" | "REACTIVATE" | "REMOVE";

type Props = {
  disabled: boolean;
  /** Disable or Enable, when the account offers one now. */
  offeredChange: AccountChangeAction | null;
  offersRemove: boolean;
  onChoose: (action: AccountDecision) => void;
};

/** What the owner can decide on an unlinked account: whose it is, and Disable, Enable or Remove when offered. */
export function DecideAccountMenu({ disabled, offeredChange, offersRemove, onChoose }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={disabled} />}>
        {t("people.accounts.decide")}
        <CaretDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onChoose("link")}>
          {t("people.accounts.linkToPerson")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChoose("SERVICE")}>
          {t("people.accounts.markService")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChoose("EXTERNAL")}>
          {t("people.accounts.markExternal")}
        </DropdownMenuItem>
        {(offeredChange === "SUSPEND" || offeredChange === "REACTIVATE") && (
          <DropdownMenuItem onClick={() => onChoose(offeredChange)}>
            {t(offeredChange === "SUSPEND" ? "apps.change.disable" : "apps.change.enable")}
          </DropdownMenuItem>
        )}
        {offersRemove && (
          <DropdownMenuItem variant="destructive" onClick={() => onChoose("REMOVE")}>
            {t("apps.change.remove")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
