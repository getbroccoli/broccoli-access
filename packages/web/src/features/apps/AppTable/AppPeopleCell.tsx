import { Link } from "@tanstack/react-router";

import { Avatar } from "@/components/Avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import type { AppRow } from "./appRow";

type Props = Pick<AppRow, "users" | "peopleCount">;

/** How many avatars fit in the column below the `sm` breakpoint, such as on a phone. */
const NARROW_AVATARS = 2;

/**
 * The app's first users as overlapping avatars, each naming its person and email on hover and
 * keyboard focus, then how many more; screen readers hear the exact total. Below the `sm`
 * breakpoint it shows fewer avatars and counts the rest, so the group fits a phone's width.
 */
export function AppPeopleCell({ users, peopleCount }: Props) {
  if (users.length === 0) {
    return <span className="tabular-nums">{peopleCount}</span>;
  }
  // Each count covers the avatars hidden at its width.
  const counts = [
    { more: peopleCount - users.length, className: "max-sm:hidden" },
    { more: peopleCount - Math.min(users.length, NARROW_AVATARS), className: "sm:hidden" },
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center">
        {users.map(({ id, employee }, index) => {
          const name = `${employee.firstName} ${employee.lastName}`;
          return (
            <Tooltip key={id}>
              <TooltipTrigger
                render={<Link to="/people/$employeeId" params={{ employeeId: employee.id }} />}
                aria-label={t("apps.personWithEmail", { name, email: employee.email })}
                className={cn(
                  "relative -ml-1 rounded-full ring-2 ring-background outline-none first:ml-0 hover:z-10 focus-visible:z-10 focus-visible:ring-ring",
                  index >= NARROW_AVATARS && "max-sm:hidden",
                )}
              >
                <Avatar
                  url={employee.avatarUrl}
                  firstName={employee.firstName}
                  lastName={employee.lastName}
                />
              </TooltipTrigger>
              <TooltipContent className="flex-col items-start gap-0">
                <span className="font-medium">{name}</span>
                <span>{employee.email}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {counts.map(
          ({ more, className }) =>
            more > 0 && (
              <span
                key={className}
                aria-hidden
                className={cn(
                  "relative -ml-1 flex h-8 min-w-8 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-foreground tabular-nums ring-2 ring-background",
                  className,
                )}
              >
                +{more}
              </span>
            ),
        )}
        <span className="sr-only">{t("apps.peopleTotal", { count: String(peopleCount) })}</span>
      </div>
    </TooltipProvider>
  );
}
