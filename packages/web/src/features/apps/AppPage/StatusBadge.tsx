import { cn } from "@/lib/class-names";

type Props = {
  /** `warning` for a suspension in Google, `muted` for an account disabled in its app. */
  tone: "active" | "warning" | "muted";
  children: string;
};

/** A user's status as a small rounded label in the users table. */
export function StatusBadge({ tone, children }: Props) {
  return (
    <span
      className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}
    >
      {children}
    </span>
  );
}

const TONES = {
  active: "bg-brand-soft text-brand-deep",
  warning: "bg-amber-100 text-amber-900",
  muted: "bg-muted text-foreground/70",
} as const;
