import { toast } from "sonner";
import { useQuery } from "@apollo/client/react";
import { useState } from "react";

import { PeopleToLinkDocument, type PeopleToLinkQuery } from "@/__generated__/graphql";
import { TableSearchField } from "@/components/dataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n";

import { SEARCH_MAX_LENGTH } from "../peopleSearch";

type Person = PeopleToLinkQuery["employees"]["edges"][number]["node"];

/** Searches the directory, including employees who were not suggested for the account. */
export function LinkAccountDialog({
  email,
  linking,
  onLink,
  onClose,
}: {
  email: string;
  linking: boolean;
  onLink: (person: Person) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState<string>();
  const [id, setId] = useState("");
  const { data, error, loading, refetch, fetchMore } = useQuery(PeopleToLinkDocument, {
    variables: { search },
  });
  const people = data?.employees.edges.map(({ node }) => node) ?? [];
  const chosen = people.find((person) => person.id === id);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t("people.accounts.choose", { email })}</DialogTitle>
        <TableSearchField
          query={search}
          onQueryChange={setSearch}
          label={t("people.search.label")}
          placeholder={t("people.search.placeholder")}
          maxLength={SEARCH_MAX_LENGTH}
        />
        <label className="grid gap-2 text-sm font-medium">
          {t("people.accounts.choosePerson")}
          <select
            value={chosen?.id ?? ""}
            onChange={(event) => setId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2"
          >
            <option value="" disabled>
              {t("people.accounts.choosePerson")}
            </option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName} ({person.email})
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div role="alert">
            {t("people.error.title")}{" "}
            <Button variant="ghost" onClick={() => void refetch().catch(() => undefined)}>
              {t("people.error.retry")}
            </Button>
          </div>
        )}
        {!error && !loading && !people.length && (
          <p>{search ? t("people.noResults.title", { query: search }) : t("people.empty.title")}</p>
        )}
        {data?.employees.pageInfo.hasNextPage && (
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() =>
              void fetchMore({
                variables: { after: data.employees.pageInfo.endCursor },
                updateQuery: (previous, { fetchMoreResult: next }) => ({
                  ...next,
                  employees: {
                    ...next.employees,
                    edges: [...previous.employees.edges, ...next.employees.edges],
                  },
                }),
              }).catch(() => toast.error(t("people.accounts.morePeopleFailed")))
            }
          >
            {t("people.accounts.more")}
          </Button>
        )}
        <Button disabled={!chosen || linking || loading} onClick={() => chosen && onLink(chosen)}>
          {t("people.accounts.link")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
