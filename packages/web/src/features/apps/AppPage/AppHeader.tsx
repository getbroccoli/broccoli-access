import { ArrowUpRight, CaretLeft } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import type { AppPageQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { ScanNowButton } from "@/shell";

import { ApproveAppButton } from "../ApproveAppButton";
import { useAppStatusChange } from "../useAppStatusChange";
import { AppStatusBadge } from "./AppStatusBadge";
import { AppSubtitle } from "./AppSubtitle";
import { IgnoreAppButton } from "./IgnoreAppButton";

type Props = {
  app: Pick<
    NonNullable<AppPageQuery["app"]>,
    "id" | "name" | "domain" | "catalogKey" | "status" | "connected" | "containerConnection"
  >;
};

/**
 * The way back to Applications, the app with its status, domain and connection, and Approve or
 * Ignore; a connected app's admin page and Scan now.
 */
export function AppHeader({ app }: Props) {
  const { approve, ignore, pending } = useAppStatusChange(app);
  const connection = app.containerConnection;
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
          <AppMark
            name={app.name}
            catalogKey={app.catalogKey}
            className="size-14 rounded-xl text-xl"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{app.name}</h1>
              <AppStatusBadge status={app.status} />
              {app.connected && (
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                  {t("apps.page.connected")}
                </span>
              )}
            </div>
            <AppSubtitle app={app} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ApproveAppButton app={app} size="lg" disabled={pending} onApprove={approve} />
          <IgnoreAppButton app={app} disabled={pending} onIgnore={ignore} />
          {connection?.adminUrl && (
            <a
              href={connection.adminUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}
            >
              {t("apps.page.openAdmin", { app: app.name })}
              <ArrowUpRight size={14} aria-hidden />
            </a>
          )}
          {connection && (
            <ScanNowButton
              connectionId={connection.id}
              isScanning={connection.scan?.status === "SCANNING"}
              className="pb-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
