import type { AppPageQuery } from "@/__generated__/graphql";
import { Avatar } from "@/components/Avatar";

type Props = {
  employee: NonNullable<AppPageQuery["app"]>["users"][number]["employee"];
};

/** A user's avatar, or initials without one, their name and their email below. */
export function PersonCell({ employee }: Props) {
  return (
    <div className="flex items-center gap-3">
      <Avatar
        url={employee.avatarUrl ?? null}
        firstName={employee.firstName}
        lastName={employee.lastName}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">
          {employee.firstName} {employee.lastName}
        </span>
        <span className="truncate text-xs text-muted-foreground">{employee.email}</span>
      </span>
    </div>
  );
}
