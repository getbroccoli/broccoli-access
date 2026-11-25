import type { ReactNode } from "react";

import { AppMark } from "@/components/AppMark";

import type { AppRow } from "./appRow";

type Props = Pick<AppRow, "name" | "domain" | "catalogKey"> & { badge?: ReactNode };

/** The app's mark and name, with its domain below. */
export function AppNameCell({ name, domain, catalogKey, badge }: Props) {
  return (
    <div className="flex items-center gap-3">
      <AppMark name={name} catalogKey={catalogKey} />
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          {badge}
        </span>
        {domain && <span className="truncate text-xs text-muted-foreground">{domain}</span>}
      </span>
    </div>
  );
}
