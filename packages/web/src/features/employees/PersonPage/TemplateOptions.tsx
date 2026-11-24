import { useQuery } from "@apollo/client/react";
import { toast } from "sonner";
import { AssignableTemplatesDocument } from "@/__generated__/graphql";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

type Template = { id: string; name: string };
export function TemplateOptions({
  employeeId,
  onAssign,
}: {
  employeeId: string;
  onAssign: (template: Template) => void;
}) {
  const { data, loading, error, fetchMore, refetch } = useQuery(AssignableTemplatesDocument, {
    variables: { employeeId },
    fetchPolicy: "network-only",
  });
  const page = data?.templates;
  if (!page && error)
    return (
      <DropdownMenuItem closeOnClick={false} onClick={() => void refetch().catch(() => undefined)}>
        {t("templates.error")} · {t("templates.retry")}
      </DropdownMenuItem>
    );
  if (!page)
    return <DropdownMenuItem disabled>{t("people.person.loadingTemplates")}</DropdownMenuItem>;
  const options = page.edges;
  return (
    <>
      {options.map(({ node }) => (
        <DropdownMenuItem key={node.id} onClick={() => onAssign(node)}>
          {node.name}
        </DropdownMenuItem>
      ))}
      {page.pageInfo.hasNextPage && (
        <DropdownMenuItem
          disabled={loading}
          closeOnClick={false}
          onClick={() =>
            void fetchMore({
              variables: { after: page.pageInfo.endCursor },
              updateQuery: (previous, { fetchMoreResult }) => ({
                ...previous,
                templates: {
                  ...fetchMoreResult.templates,
                  edges: [...previous.templates.edges, ...fetchMoreResult.templates.edges],
                },
              }),
            }).catch(() => toast.error(t("templates.error")))
          }
        >
          {t("people.person.moreTemplates")}
        </DropdownMenuItem>
      )}
      {!options.length && !page.pageInfo.hasNextPage && (
        <DropdownMenuItem disabled>{t("people.person.noTemplatesToAssign")}</DropdownMenuItem>
      )}
    </>
  );
}
