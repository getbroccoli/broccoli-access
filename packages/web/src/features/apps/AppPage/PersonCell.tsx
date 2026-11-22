import type { AppPageQuery } from "@/__generated__/graphql";
import { Avatar } from "@/components/Avatar";
import { t } from "@/i18n";

type Props = {
  employee: NonNullable<AppPageQuery["app"]>["users"][number]["employee"];
  /** Marks the member whose key or session the app's connection uses as "You". */
  isConnectionUser: boolean;
};

/** A user's avatar, or initials without one, their name and their email below. */
export function PersonCell({ employee, isConnectionUser }: Props) {
  return (
    <div className="flex items-center gap-3">
      <Avatar
        url={employee.avatarUrl ?? null}
        firstName={employee.firstName}
        lastName={employee.lastName}
      />
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">
            {employee.firstName} {employee.lastName}
          </span>
          {isConnectionUser && (
            <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-foreground/70">
              {t("apps.page.you")}
            </span>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">{employee.email}</span>
      </span>
    </div>
  );
}
