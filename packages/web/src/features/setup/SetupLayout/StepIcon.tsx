import { CheckCircle } from "@phosphor-icons/react";

import { cn } from "@/lib/class-names";

import type { StepView } from "./setupSteps";

type Props = Pick<StepView, "number" | "state">;

/** A filled check for a done step, otherwise the step's number in a circle. */
export function StepIcon({ number, state }: Props) {
  if (state === "done") {
    return <CheckCircle size={22} weight="fill" className="shrink-0 text-brand" aria-hidden />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        state === "current" ? "bg-background text-foreground" : "border border-border",
      )}
    >
      {number}
    </span>
  );
}
