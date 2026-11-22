import { Envelope } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

type Props = {
  /** The work email, edited in place by those who may change it. */
  email: ReactNode;
  /** An unsaved or refused email marks its card as the panel marks its other fields. */
  emailMark: "changed" | "invalid" | null;
};

/** The facts at the top of a person's panel: their work email. */
export function KeyFacts({ email, emailMark }: Props) {
  return (
    <dl className="flex flex-wrap gap-3">
      <div
        className={cn(
          "min-w-0 flex-[1_1_18rem] rounded-xl border border-border px-3 py-2.5",
          emailMark && "border-l-2 bg-brand-soft/40",
          emailMark === "changed" && "border-l-brand",
          emailMark === "invalid" && "border-l-destructive",
        )}
      >
        <dt className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase">
          <Envelope aria-hidden className="size-3.5 shrink-0" />
          {t("people.panel.fact.email")}
        </dt>
        <dd className="flex items-center gap-2 pt-1 text-sm font-medium">
          {/* The field pads its value for its hover and focus ring; this lines the text up with the label. */}
          <div className="-mx-1.5 min-w-0 flex-1">{email}</div>
        </dd>
      </div>
    </dl>
  );
}
