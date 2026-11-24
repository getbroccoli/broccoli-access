import { useQuery } from "@apollo/client/react";
import { CaretLeft } from "@phosphor-icons/react";
import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { useRef } from "react";

import { TemplatePageDocument, MoreTemplatePeopleDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { AddAppMenu } from "./AddAppMenu";
import { DeleteTemplateButton } from "./DeleteTemplateButton";
import { RenameTemplateButton } from "./RenameTemplateButton";
import { TemplatePeople } from "./TemplatePeople";
import { TemplateAppsTable } from "./TemplateAppsTable";
import { useTemplateAppChanges } from "./useTemplateAppChanges";

/** A template: its name with Rename and Delete, its apps, and how many people have it. */
export function TemplatePage() {
  const { templateId } = useParams({ from: "/_authenticated/templates_/$templateId" });
  // The route's loader has just read the page into the cache.
  const { data, fetchMore, loading } = useQuery(TemplatePageDocument, {
    variables: { id: templateId },
  });
  const template = data?.template;
  const { changing, add, takeOut, setRole } = useTemplateAppChanges(templateId);
  const appsHeading = useRef<HTMLHeadingElement>(null);
  // The route's loader found the template, so it is missing only once it is deleted.
  if (!template) {
    return null;
  }
  const inTemplate = new Set(template.apps.map(({ app }) => app.id));
  const appsToAdd = data.apps.edges.map(({ node }) => node).filter(({ id }) => !inTemplate.has(id));

  return (
    <div className="flex flex-col gap-5">
      <title>{`${template.name} · ${t("app.name")}`}</title>
      <Link
        to="/templates"
        className="flex w-fit items-center gap-1.5 text-sm text-foreground/80 transition-colors hover:text-foreground"
      >
        <CaretLeft size={14} weight="bold" />
        {t("templates.title")}
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1
          tabIndex={-1}
          className="min-w-0 truncate text-[26px] leading-tight font-semibold tracking-tight outline-none"
        >
          {template.name}
        </h1>
        <div className="flex gap-2">
          <RenameTemplateButton template={template} />
          <DeleteTemplateButton template={template} />
        </div>
      </header>
      <section aria-labelledby="template-apps" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="template-apps"
            ref={appsHeading}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight outline-none"
          >
            {t("templates.apps.title")}
          </h2>
          <AddAppMenu apps={appsToAdd} disabled={changing} onAdd={(app) => void add(app)} />
        </div>
        <TemplateAppsTable
          apps={template.apps}
          disabled={changing}
          onSetRole={(app, role) => void setRole(app, role)}
          // The row leaves with its button, so focus moves to the section it was in.
          onTakeOut={(app) =>
            void takeOut(app).then((left) => left && appsHeading.current?.focus())
          }
        />
      </section>
      <section aria-labelledby="template-people" className="flex flex-col gap-3">
        <h2 id="template-people" className="text-lg font-semibold tracking-tight">
          {t("templates.people.title")}{" "}
          <span className="font-medium text-muted-foreground">{template.peopleCount}</span>
        </h2>
        <TemplatePeople
          key={template.id}
          people={template.people}
          loading={loading}
          onMore={() =>
            void fetchMore({
              query: MoreTemplatePeopleDocument,
              variables: { id: templateId, after: template.people.pageInfo.endCursor! },
              updateQuery: (previous, { fetchMoreResult }) => {
                if (!previous.template || !fetchMoreResult.template) return previous;
                const next = fetchMoreResult.template.people;
                return {
                  ...previous,
                  template: {
                    ...previous.template,
                    people: {
                      ...next,
                      edges: [
                        ...new Map(
                          [...previous.template.people.edges, ...next.edges].map((edge) => [
                            edge.node.id,
                            edge,
                          ]),
                        ).values(),
                      ],
                    },
                  },
                };
              },
            }).catch(() => toast.error(t("templates.people.moreFailed")))
          }
        />
      </section>
    </div>
  );
}
