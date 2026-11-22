import { Plant } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";

import { t } from "@/i18n";

import { type SetupStepId, stepViews } from "./setupSteps";
import { StepBars } from "./StepBars";
import { StepList } from "./StepList";

type Props = {
  step: SetupStepId;
  title: string;
  description?: string;
  children?: ReactNode;
};

/**
 * The frame of the setup pages: the setup steps beside a card with the step's heading. The card
 * fills the window and scrolls; the document does not.
 */
export function SetupLayout({ step, title, description, children }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = stepViews(step);
  const current = steps.find(({ state }) => state === "current");

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app-backdrop text-foreground md:flex-row">
      <title>{`${title} · ${t("app.name")}`}</title>
      <aside className="flex shrink-0 flex-col gap-3 px-3 pt-3 pb-2 md:w-[252px] md:gap-6 md:py-4">
        <div className="flex h-9 min-w-0 items-center gap-2.5 px-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
            <Plant size={15} weight="fill" aria-hidden />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight">{t("app.name")}</span>
        </div>
        <nav aria-label={t("setup.progress")} className="px-2 md:px-0">
          <p className="hidden px-2 pb-2 text-xs font-medium text-muted-foreground md:block">
            {t("setup.title")}
          </p>
          <StepList steps={steps} />
          <StepBars steps={steps} />
        </nav>
      </aside>
      <main className="m-2 mt-0 min-h-0 min-w-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-card shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 md:my-3 md:mr-3 md:ml-0">
        <div className="flex max-w-[870px] flex-col gap-8 px-6 py-8 sm:px-14 sm:py-12">
          <header>
            {current && (
              <p className="text-sm text-muted-foreground">
                {t("setup.stepOf", { number: String(current.number), total: String(steps.length) })}
              </p>
            )}
            <h1
              ref={heading}
              tabIndex={-1}
              className="mt-1 text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] outline-none"
            >
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-[760px] text-base leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
