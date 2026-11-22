import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/class-names";

import type { NavItem } from "./NavList";

type Props = { item: NavItem };

/** A menu link, filled while its page is open. */
export function NavLink({ item: { to, label, icon: Icon, badge } }: Props) {
  return (
    <Link
      to={to}
      // Every page sits under `/`, so Today is active only on itself.
      activeOptions={{ exact: to === "/" }}
      className="flex h-8 items-center gap-2 rounded-md px-2 text-sm whitespace-nowrap transition-colors"
      activeProps={{ className: "bg-foreground text-background" }}
      inactiveProps={{ className: "text-foreground/80 hover:bg-foreground/5" }}
    >
      {({ isActive }) => (
        <>
          {Icon && <Icon size={16} weight={isActive ? "bold" : "regular"} />}
          <span className="flex-1 font-medium">{label}</span>
          {badge !== undefined && (
            <span
              className={cn(
                "rounded-full px-2 text-[11px] leading-[18px] font-medium tabular-nums",
                isActive ? "bg-background/20" : "bg-foreground/10",
              )}
            >
              {badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
