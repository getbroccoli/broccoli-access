import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";

import type { ScanStepState } from "@/__generated__/graphql";

type Props = {
  state: ScanStepState;
};

/** A scan step's state: a check when done, a warning when failed, a spinner or a waiting dot. */
export function ScanStateIcon({ state }: Props) {
  switch (state) {
    case "DONE":
      return <CheckCircle size={22} weight="fill" className="shrink-0 text-brand" aria-hidden />;
    case "FAILED":
      return (
        <WarningCircle size={22} weight="fill" className="shrink-0 text-destructive" aria-hidden />
      );
    case "RUNNING":
      return (
        <CircleNotch
          size={22}
          className="shrink-0 animate-spin text-muted-foreground"
          aria-hidden
        />
      );
    case "WAITING":
      return <span aria-hidden className="mx-[6px] size-2.5 shrink-0 rounded-full bg-border" />;
  }
}
