import { CaretLeft } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import type { AppPageQuery } from "@/__generated__/graphql";
import { AppInitial } from "@/components/AppInitial";
import { t } from "@/i18n";

import { AppStatusActions } from "../AppStatusActions";
import { AppStatusBadge } from "./AppStatusBadge";

type Props = {
  app: Pick<NonNullable<AppPageQuery["app"]>, "id" | "name" | "domain" | "status" | "connected">;
};

/** The way back to Applications, the app with its status and domain, and Approve or Ignore. */
export function AppHeader({ app }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/apps"
        className="flex w-fit items-center gap-1.5 text-sm text-foreground/80 transition-colors hover:text-foreground"
      >
        <CaretLeft size={14} weight="bold" />
        {t("apps.title")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <AppInitial name={app.name} className="size-14 rounded-xl text-xl" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{app.name}</h1>
              <AppStatusBadge status={app.status} />
            </div>
            {app.domain && <span className="text-sm text-muted-foreground">{app.domain}</span>}
          </div>
        </div>
        <AppStatusActions app={app} size="lg" />
      </div>
    </div>
  );
}
