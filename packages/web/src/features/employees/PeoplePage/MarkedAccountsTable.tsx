import { useState } from "react";
import type { MarkedAccountsQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { t } from "@/i18n";
import { AccountNoteDialog } from "./AccountNoteDialog";

/** Service and external accounts, listed below the accounts still waiting for a decision. */
export function MarkedAccountsTable({
  accounts,
  loading,
  loadMore,
  refresh,
}: {
  accounts: MarkedAccountsQuery["markedAccounts"];
  loading: boolean;
  loadMore: () => void;
  refresh: () => Promise<unknown>;
}) {
  const [editingId, setEditing] = useState<string>();
  const editing = accounts.edges.find(({ node }) => node.id === editingId)?.node;
  return (
    <section aria-labelledby="marked-accounts" className="mt-5 grid gap-2.5">
      <h2 id="marked-accounts" className="text-lg font-semibold">
        {t("people.accounts.marked")}
      </h2>
      <div className="overflow-hidden rounded-xl border border-border">
        <Table className="min-w-[660px]" aria-labelledby="marked-accounts">
          <TableBody>
            {!accounts.edges.length && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  {t("people.accounts.noneMarked")}
                </TableCell>
              </TableRow>
            )}
            {accounts.edges.map(({ node }) => (
              <TableRow key={node.id}>
                <TableCell className="h-12 pl-4 font-semibold">{node.email}</TableCell>
                <TableCell className="font-medium">{node.app.name}</TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${node.kind === "SERVICE" ? "bg-indigo-50 text-indigo-800" : "bg-purple-50 text-purple-800"}`}
                  >
                    {t(
                      node.kind === "SERVICE"
                        ? "people.accounts.service"
                        : "people.accounts.external",
                    )}
                  </span>
                </TableCell>
                <TableCell className="max-w-sm whitespace-normal wrap-anywhere text-muted-foreground">
                  {node.canEdit ? node.note : t("people.accounts.integrationUser")}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  {node.canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(node.id)}>
                      {t("people.accounts.edit")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {accounts.pageInfo.hasNextPage && (
          <Button variant="ghost" disabled={loading} onClick={loadMore}>
            {t("people.accounts.more")}
          </Button>
        )}
      </div>
      {editing && (
        <AccountNoteDialog
          key={editing.id}
          account={editing}
          onClose={() => setEditing(undefined)}
          refresh={refresh}
        />
      )}
    </section>
  );
}
