import { Link } from "@tanstack/react-router";

import type { PeopleDifferencesQuery } from "@/__generated__/graphql";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";

import { ExtraAppActions } from "./ExtraAppActions";

type Extra = NonNullable<PeopleDifferencesQuery["accessDifferences"]["extra"]>[number];

type Props = { differences: Extra[]; isOwner: boolean };

/** The people with active access outside their expected apps. */
export function ExtraAccountsTable({ differences, isOwner }: Props) {
  const rows = differences.toSorted(
    (a, b) =>
      nameOf(a.employee).localeCompare(nameOf(b.employee)) || a.app.name.localeCompare(b.app.name),
  );
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table aria-labelledby="extra-apps">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4 text-muted-foreground">
              {t("people.column.person")}
            </TableHead>
            <TableHead className="text-muted-foreground">{t("templates.column.app")}</TableHead>
            <TableHead className="text-muted-foreground">{t("people.differences.why")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("templates.column.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ employee, app, activeAccounts }) => (
            <TableRow key={employee.id + "/" + app.id}>
              <TableCell className="py-3 pl-4">
                <Link
                  to="/people/$employeeId"
                  params={{ employeeId: employee.id }}
                  className="font-semibold hover:text-brand-deep"
                >
                  {nameOf(employee)}
                </Link>
              </TableCell>
              <TableCell className="font-medium">{app.name}</TableCell>
              <TableCell className="text-foreground/80">
                {t("people.differences.extraReason")}
              </TableCell>
              <TableCell className="pr-4 text-right">
                <ExtraAppActions
                  employee={employee}
                  app={app}
                  accounts={activeAccounts}
                  isOwner={isOwner}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function nameOf({ firstName, lastName }: Extra["employee"]) {
  return `${firstName} ${lastName}`;
}
