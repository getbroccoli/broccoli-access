import { Link } from "@tanstack/react-router";

import { Avatar } from "@/components/Avatar";

import type { AccountChangeRow } from "./accountChangeRow";

type Props = { change: Pick<AccountChangeRow, "employee" | "email"> };

/** The employee with the change's email, linking to them, or the email alone when nobody has it. */
export function ChangePersonCell({ change: { employee, email } }: Props) {
  if (!employee) {
    return (
      <span className="flex items-center gap-3">
        <Avatar url={null} firstName={email} lastName="" />
        <span className="truncate font-medium">{email}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-3">
      <Avatar
        url={employee.avatarUrl ?? null}
        firstName={employee.firstName}
        lastName={employee.lastName}
      />
      <span className="flex min-w-0 flex-col">
        <Link
          to="/people/$employeeId"
          params={{ employeeId: employee.id }}
          className="truncate font-medium hover:underline"
        >
          {employee.firstName} {employee.lastName}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{employee.email}</span>
      </span>
    </span>
  );
}
