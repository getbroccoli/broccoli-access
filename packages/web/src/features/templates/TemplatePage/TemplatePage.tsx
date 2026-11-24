import { useQuery } from "@apollo/client/react";
import { CaretLeft } from "@phosphor-icons/react";
import { Link, useParams } from "@tanstack/react-router";
import { useRef } from "react";

import { TemplatePageDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { AddAppMenu } from "./AddAppMenu";
import { DeleteTemplateButton } from "./DeleteTemplateButton";
import { RenameTemplateButton } from "./RenameTemplateButton";
import { TemplateAppsTable } from "./TemplateAppsTable";
import { useTemplateAppChanges } from "./useTemplateAppChanges";

/** A template: its name with Rename and Delete, its apps, and how many people have it. */
export function TemplatePage() {
  const { templateId } = useParams({ from: "/_authenticated/templates_/$templateId" });
  // The route's loader has just read the page into the cache.
  const { data } = useQuery(TemplatePageDocument, { variables: { id: templateId } });
  const template = data?.template;
  const { changing, add, takeOut } = useTemplateAppChanges(templateId);
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
        {template.peopleCount === 0 && (
          <p className="text-sm text-muted-foreground">{t("templates.people.empty")}</p>
        )}
      </section>
    </div>
  );
}
