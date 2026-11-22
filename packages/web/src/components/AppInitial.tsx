import { cn } from "@/lib/class-names";

type Props = {
  name: string;
  /** Overrides the size and adds to the look, such as a larger square in a page's header. */
  className?: string;
};

/** The app's initial in a square tinted by its name, so it keeps its colour. */
export function AppInitial({ name, className }: Props) {
  const hue = hueOf(name);
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
        className,
      )}
      style={{ backgroundColor: `oklch(0.95 0.03 ${hue})`, color: `oklch(0.5 0.13 ${hue})` }}
    >
      {[...name][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** A hue that stays the same for an app's name. */
function hueOf(name: string): number {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)!) % 360;
  }
  return hash;
}
