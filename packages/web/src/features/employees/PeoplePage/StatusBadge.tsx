import type { EmployeeStatus } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

type Props = { status: EmployeeStatus };

/** A person's status in the directory: green while active, amber once suspended. */
export function StatusBadge({ status }: Props) {
  const isActive = status === "ACTIVE";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        isActive ? "bg-brand-soft text-brand-deep" : "bg-amber-100 text-amber-900",
      )}
    >
      {t(isActive ? "people.status.active" : "people.status.suspended")}
    </span>
  );
}
