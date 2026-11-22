import { cn } from "@/lib/class-names";

type Props = {
  label: string;
  count: number;
  /** Tints the card amber, for a number that needs the owner's attention. */
  warning?: boolean;
};

/** A number with what it counts, in a card. */
export function CountCard({ label, count, warning = false }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border px-5 py-4",
        warning ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border",
      )}
    >
      <span className={cn("text-sm", !warning && "text-muted-foreground")}>{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{count}</span>
    </div>
  );
}
