import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import type { StepView } from "./setupSteps";
import { StepIcon } from "./StepIcon";

/** The steps as a list with their state, on wide screens. */
export function StepList({ steps }: { steps: StepView[] }) {
  return (
    <ol className="hidden flex-col gap-1 md:flex">
      {steps.map(({ id, number, title, state }) => (
        <li key={id} aria-current={state === "current" ? "step" : undefined}>
          <div
            className={cn(
              "flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-1.5 text-[15px] leading-tight",
              state === "current" && "bg-foreground text-background",
            )}
          >
            <StepIcon number={number} state={state} />
            {t(title)}
            {state === "done" && <span className="sr-only"> {t("setup.completed")}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
