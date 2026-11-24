import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { TemplatePageQuery } from "@/__generated__/graphql";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** The first six people fit beside the template's count; the rest are one click away. */
const FIRST_PEOPLE = 6;

export function TemplatePeople({
  people,
}: {
  people: NonNullable<TemplatePageQuery["template"]>["people"];
}) {
  const [expanded, setExpanded] = useState(false);
  if (!people.length)
    return <p className="text-sm text-muted-foreground">{t("templates.people.empty")}</p>;
  const visible = expanded ? people : people.slice(0, FIRST_PEOPLE);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((person) => (
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
      {visible.length < people.length && (
        <Button variant="link" onClick={() => setExpanded(true)}>
          {t("templates.showMore", { count: String(people.length - visible.length) })}
        </Button>
      )}
    </div>
  );
}
