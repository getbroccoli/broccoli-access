import { useQuery } from "@apollo/client/react";
import { CaretLeft, ListChecks, Pulse, SquaresFour, Users } from "@phosphor-icons/react";
import { Link, useRouteContext } from "@tanstack/react-router";

import { NavCountsDocument } from "@/__generated__/graphql";

import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { useRefetchAfterContainerConnectorScans } from "@/lib/useRefetchAfterContainerConnectorScans";
import { useRefetchAfterScan } from "@/lib/useRefetchAfterScan";

import { ProfileMenu } from "../ProfileMenu";
import { useInSettings } from "../useInSettings";
import { WorkspaceMenu } from "../WorkspaceMenu";
import { NavList, type NavItem } from "./NavList";

const SETTINGS_ITEMS: NavItem[] = [
  { to: "/settings/google-workspace", label: t("settings.googleWorkspace.title") },
  { to: "/settings/apps", label: t("settings.apps.title") },
  { to: "/settings/email", label: t("settings.email.title") },
];

type Props = {
  /** Fades the menu in and, on wide screens, widens it from nothing as it appears. */
  reveal?: boolean;
};

/**
 * The app menu, or the Settings menu while a settings page is open. On wide screens both
 * sit side by side in one strip that slides between them.
 */
export function LeftNav({ reveal = false }: Props) {
  const inSettings = useInSettings();
  const appItems = useAppItems();
  return (
    <aside
      className={cn(
        "shrink-0 md:h-full md:w-56 md:overflow-hidden",
        reveal &&
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500 motion-safe:md:transition-[width] motion-safe:md:ease-[cubic-bezier(0.65,0,0.35,1)] motion-safe:md:starting:w-0",
      )}
    >
      <div
        className={cn(
          "md:flex md:h-full md:w-112 md:transition-transform md:duration-500 md:ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none",
          inSettings && "md:-translate-x-1/2",
        )}
      >
        {/* `inert` keeps Tab and screen readers out of the menu slid off screen. */}
        <div inert={inSettings} className={cn(menuClass, inSettings && "max-md:hidden")}>
          <div className="min-w-0 flex-1 max-md:shrink-0 max-md:basis-auto md:flex-none md:pt-1 md:pb-4">
            <WorkspaceMenu />
          </div>
          <NavList label={t("nav.label")} items={appItems} />
          <ProfileMenu />
        </div>
        <div inert={!inSettings} className={cn(menuClass, !inSettings && "max-md:hidden")}>
          <Link
            to="/"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium whitespace-nowrap text-foreground/80 transition-colors hover:bg-foreground/5"
          >
            <CaretLeft size={14} weight="bold" />
            {t("nav.backToApp")}
          </Link>
          <span className="px-2 pt-3 pb-4 text-lg font-bold tracking-tight max-md:hidden">
            {t("settings.title")}
          </span>
          <NavList label={t("settings.title")} items={SETTINGS_ITEMS} />
          <ProfileMenu />
        </div>
      </div>
    </aside>
  );
}

/**
 * The app's pages, with Applications, Templates and Activity for admins only; Applications shows how many
 * apps await their decision, and People how many people are suspended with access.
 */
function useAppItems(): NavItem[] {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const canManage = me.operations.includes("MANAGE_WORKSPACE");
  const { data, refetch } = useQuery(NavCountsDocument, { skip: !canManage });
  useRefetchAfterScan(data?.setup.googleWorkspace?.scan?.status === "SCANNING", refetch);
  useRefetchAfterContainerConnectorScans(refetch);
  const discovered = data?.appCounts.discovered ?? 0;
  const suspendedWithAccess = data?.employeeCounts.suspendedWithAccess ?? 0;
  const applications: NavItem = {
    to: "/apps",
    label: t("nav.applications"),
    icon: SquaresFour,
    badge: discovered > 0 ? discovered : undefined,
  };
  const templates: NavItem = { to: "/templates", label: t("nav.templates"), icon: ListChecks };
  const activity: NavItem = { to: "/activity", label: t("nav.activity"), icon: Pulse };
  return [
    ...(canManage ? [applications] : []),
    {
      to: "/people",
      label: t("nav.people"),
      icon: Users,
      badge: suspendedWithAccess > 0 ? suspendedWithAccess : undefined,
      badgeTone: "warning",
    },
    ...(canManage ? [templates, activity] : []),
  ];
}

const menuClass =
  "flex items-center gap-3 px-3 py-2 max-md:overflow-x-auto md:h-full md:w-56 md:flex-col md:items-stretch md:gap-1 md:py-4";
