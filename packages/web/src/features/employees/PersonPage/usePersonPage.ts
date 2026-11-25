import { useQuery } from "@apollo/client/react";
import { toast } from "sonner";
import { PersonPageDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";

/** The two independent cursors leave each app’s full list of source templates intact. */
export function usePersonPage(id: string) {
  const pageQuery = useQuery(PersonPageDocument, { variables: { id } });
  function more(field: "templates" | "personApps") {
    const cursor = pageQuery.data?.employee?.[field].pageInfo.endCursor;
    if (!cursor) return;
    void pageQuery
      .fetchMore({
        variables: field === "templates" ? { templatesAfter: cursor } : { appsAfter: cursor },
        updateQuery: (previous, { fetchMoreResult }) => {
          const before = previous.employee,
            next = fetchMoreResult.employee;
          if (!before || !next) return previous;
          // The newest answer wins, so rows, invites and steps stay in step; only the paged list
          // that asked for more keeps what it had loaded.
          const merged =
            field === "templates"
              ? {
                  personApps: before.personApps,
                  templates: {
                    ...next.templates,
                    edges: [...before.templates.edges, ...next.templates.edges],
                  },
                }
              : {
                  templates: before.templates,
                  personApps: {
                    ...next.personApps,
                    edges: [...before.personApps.edges, ...next.personApps.edges],
                  },
                };
          return { ...previous, employee: { ...next, ...merged } };
        },
      })
      .catch(() => toast.error(t("people.person.moreFailed")));
  }
  return { pageQuery, more };
}
