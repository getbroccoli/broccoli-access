import { Link } from "@tanstack/react-router";

import { Avatar } from "@/components/Avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n";

import type { AppRow } from "./appRow";

type Props = Pick<AppRow, "users" | "peopleCount">;

/**
 * The app's first users as overlapping avatars, each naming its person and email on hover and
 * keyboard focus, then how many more; screen readers hear the exact total.
 */
export function AppPeopleCell({ users, peopleCount }: Props) {
  if (users.length === 0) {
    return <span className="tabular-nums">{peopleCount}</span>;
  }
  const more = peopleCount - users.length;

  return (
    <TooltipProvider>
      <div className="flex items-center">
        {users.map(({ id, employee }) => {
          const name = `${employee.firstName} ${employee.lastName}`;
          return (
            <Tooltip key={id}>
              <TooltipTrigger
                render={<Link to="/people/$employeeId" params={{ employeeId: employee.id }} />}
                aria-label={t("apps.personWithEmail", { name, email: employee.email })}
                className="relative -ml-1 rounded-full ring-2 ring-background outline-none first:ml-0 hover:z-10 focus-visible:z-10 focus-visible:ring-ring"
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
        {more > 0 && (
          <span
            aria-hidden
            className="relative -ml-1 flex h-8 min-w-8 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-foreground tabular-nums ring-2 ring-background"
          >
            +{more}
          </span>
        )}
        <span className="sr-only">{t("apps.peopleTotal", { count: String(peopleCount) })}</span>
      </div>
    </TooltipProvider>
  );
}
