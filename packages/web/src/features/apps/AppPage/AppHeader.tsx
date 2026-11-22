import { ArrowUpRight, CaretLeft } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import type { AppPageQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { ScanNowButton } from "@/shell";

import { ApproveAppButton } from "../ApproveAppButton";
import { ConnectAppButton } from "../ConnectAppButton";
import { ConnectedBadge } from "../ConnectedBadge";
import { useAppStatusChange } from "../useAppStatusChange";
import { AppStatusBadge } from "./AppStatusBadge";
import { AppSubtitle } from "./AppSubtitle";
import { IgnoreAppButton } from "./IgnoreAppButton";

type Props = {
  app: Pick<
    NonNullable<AppPageQuery["app"]>,
    | "id"
    | "name"
    | "domain"
    | "catalogKey"
    | "status"
    | "connected"
    | "containerConnection"
    | "managingConnector"
  >;
  /** Runs once the app is connected from here. */
  onConnected: () => void;
};

/**
 * The way back to Applications, the app with its status, domain and connection, and Approve or
 * Ignore; Connect while a connector that can manage it has no connection; a connected app's admin
 * page and Scan now.
 */
export function AppHeader({ app, onConnected }: Props) {
  const { approve, ignore, pending } = useAppStatusChange(app);
  const connection = app.containerConnection;
  const connector = app.managingConnector?.connection ? null : app.managingConnector;
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
              {app.connected && <ConnectedBadge />}
            </div>
            <AppSubtitle app={app} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ApproveAppButton app={app} size="lg" disabled={pending} onApprove={approve} />
          <IgnoreAppButton app={app} disabled={pending} onIgnore={ignore} />
          {connector && (
            <ConnectAppButton connector={connector} size="lg" onConnected={onConnected} />
          )}
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
      {connector && (
        <p className="rounded-lg bg-muted/50 px-3.5 py-3 text-sm text-foreground/80">
          {t("apps.page.connectHint", { app: app.name })}
        </p>
      )}
    </div>
  );
}
