import type { ScanStepState } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";

import { ScanStateIcon } from "./ScanStateIcon";

type Props = {
  state: ScanStepState;
  title: string;
  hint: string;
};

/** One step of the scan: its state's icon, its title and what it found. */
export function ScanStepRow({ state, title, hint }: Props) {
  return (
    <li className="flex items-center gap-5 px-6 py-5">
      <ScanStateIcon state={state} />
      <span className="flex flex-col gap-0.5" aria-live="polite">
        <span
          className={cn(
            "text-[15px] font-medium",
            state === "WAITING" ? "text-foreground/70" : "text-foreground",
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "text-sm",
            state === "FAILED" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {hint}
        </span>
      </span>
    </li>
  );
}
