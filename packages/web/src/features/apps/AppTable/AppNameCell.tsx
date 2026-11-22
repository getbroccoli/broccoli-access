import { AppInitial } from "@/components/AppInitial";

type Props = { name: string; domain: string | null | undefined };

/** The app's initial in a tinted square, its name, and its domain below. */
export function AppNameCell({ name, domain }: Props) {
  return (
    <div className="flex items-center gap-3">
      <AppInitial name={name} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{name}</span>
        {domain && <span className="truncate text-xs text-muted-foreground">{domain}</span>}
      </span>
    </div>
  );
}
