import { Link } from "@tanstack/react-router";

import { Avatar } from "@/components/Avatar";
import type { PersonRow } from "./personRow";

type Props = { person: PersonRow };

/** A person's avatar, their name linking to them, and their email below. */
export function PersonCell({ person }: Props) {
  return (
    <div className="flex items-center gap-3">
      <Avatar
        url={person.avatarUrl ?? null}
        firstName={person.firstName}
        lastName={person.lastName}
      />
      <span className="flex min-w-0 flex-col">
        <Link
          to="/people/$employeeId"
          params={{ employeeId: person.id }}
          className="truncate font-medium hover:underline"
        >
          {person.firstName} {person.lastName}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{person.email}</span>
      </span>
    </div>
  );
}
