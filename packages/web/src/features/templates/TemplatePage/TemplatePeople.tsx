import { Link } from "@tanstack/react-router";
import type { TemplatePageQuery } from "@/__generated__/graphql";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export function TemplatePeople({
  people,
  count,
  loading,
  onMore,
}: {
  count: number;
  loading: boolean;
  onMore: () => void;
  people: NonNullable<TemplatePageQuery["template"]>["people"];
}) {
  if (!people.edges.length)
    return <p className="text-sm text-muted-foreground">{t("templates.people.empty")}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {people.edges.map(({ node: person }) => (
        <Link
          key={person.id}
          to="/people/$employeeId"
          params={{ employeeId: person.id }}
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1.5 text-sm font-medium hover:bg-muted"
        >
          <Avatar
            url={person.avatarUrl ?? null}
            firstName={person.firstName}
            lastName={person.lastName}
            className="size-6 text-[10px]"
          />
          {person.firstName} {person.lastName}
        </Link>
      ))}
      {people.pageInfo.hasNextPage && (
        <Button variant="link" disabled={loading} onClick={onMore}>
          {t("templates.showMore", { count: String(Math.min(6, count - people.edges.length)) })}
        </Button>
      )}
    </div>
  );
}
