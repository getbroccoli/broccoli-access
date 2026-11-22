import { AppMark } from "@/components/AppMark";

import type { AppRow } from "./appRow";

type Props = Pick<AppRow, "name" | "domain" | "catalogKey">;

/** The app's mark, its name, and its domain below. */
export function AppNameCell({ name, domain, catalogKey }: Props) {
  return (
    <div className="flex items-center gap-3">
      <AppMark name={name} catalogKey={catalogKey} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{name}</span>
        {domain && <span className="truncate text-xs text-muted-foreground">{domain}</span>}
      </span>
    </div>
  );
}
