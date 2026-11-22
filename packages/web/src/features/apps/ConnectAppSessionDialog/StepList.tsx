import { Check } from "@phosphor-icons/react";

import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

/** A step of connecting with an app session that the step list shows. */
export type ConnectStep = "extension" | "pair" | "notice" | "signIn";

type Props = {
  /** Whether the app has a notice to accept; without one, its step is left out. */
  hasNotice: boolean;
  /** The step shown; null while the page still checks for the extension. */
  current: ConnectStep | null;
};

/** The numbered steps, those before the current one ticked. */
export function StepList({ hasNotice, current }: Props) {
  const steps = STEPS.filter(({ step }) => hasNotice || step !== "notice");
  const currentIndex = steps.findIndex(({ step }) => step === current);

  return (
    <ol className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {steps.map(({ step, label }, index) => {
        const isDone = current !== null && index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 text-sm",
              isCurrent ? "font-semibold text-foreground" : "text-foreground/70",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                isDone && "bg-brand-soft text-brand-deep",
                isCurrent && "bg-foreground text-background",
                !isDone && !isCurrent && "border border-border",
              )}
            >
              {isDone ? <Check size={12} weight="bold" aria-hidden /> : index + 1}
            </span>
            {t(label)}
            {isDone && <span className="sr-only">{t("settings.appSession.done")}</span>}
          </li>
        );
      })}
    </ol>
  );
}

const STEPS = [
  { step: "extension", label: "settings.appSession.stepExtension" },
  { step: "pair", label: "settings.appSession.stepPair" },
  { step: "notice", label: "settings.appSession.stepNotice" },
  { step: "signIn", label: "settings.appSession.stepSignIn" },
] as const;
