type Props = { name: string; domain: string | null | undefined };

/** The app's initial in a tinted square, its name, and its domain below. */
export function AppNameCell({ name, domain }: Props) {
  const hue = hueOf(name);
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
        style={{ backgroundColor: `oklch(0.95 0.03 ${hue})`, color: `oklch(0.5 0.13 ${hue})` }}
      >
        {[...name][0]?.toUpperCase() ?? "?"}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{name}</span>
        {domain && <span className="truncate text-xs text-muted-foreground">{domain}</span>}
      </span>
    </div>
  );
}

/** A hue that stays the same for an app's name, so its square keeps its colour. */
function hueOf(name: string): number {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)!) % 360;
  }
  return hash;
}
