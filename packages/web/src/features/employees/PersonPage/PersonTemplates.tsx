import { useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { AssignTemplateDocument, TakeOffTemplateDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

type Template = { id: string; name: string };
type Props = {
  person: { id: string; firstName: string; status?: string | null; templates: readonly Template[] };
  available: readonly Template[];
  refresh: () => Promise<unknown>;
};

/** The person's assigned templates. Removing a chip returns focus to the section. */
export function PersonTemplates({ person, available, refresh }: Props) {
  const [assign] = usePayloadMutation(AssignTemplateDocument);
  const [takeOff] = usePayloadMutation(TakeOffTemplateDocument);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const assigned = new Set(person.templates.map((template) => template.id));
  const remaining = available.filter((template) => !assigned.has(template.id));

  async function change(template: Template, action: "assign" | "takeOff") {
    setBusy(true);
    try {
      const mutate = action === "assign" ? assign : takeOff;
      await mutate({ variables: { input: { id: template.id, employeeId: person.id } } });
      // The server recomputes app states, including those that just lost their last source.
      await refresh();
      if (action === "takeOff") heading.current?.focus();
    } catch {
      toast.error(t("people.person.templateChangeFailed", { name: template.name }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="person-templates" className="flex flex-col gap-2">
      <h2
        ref={heading}
        tabIndex={-1}
        id="person-templates"
        className="text-lg font-semibold tracking-tight outline-none"
      >
        {t("templates.title")}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        {person.templates.map((template) => (
          <span
            key={template.id}
            className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full bg-muted py-1 pr-1.5 pl-3.5 text-sm font-medium"
          >
            <span className="truncate">{template.name}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 shrink-0 rounded-full"
              disabled={busy}
              aria-label={t("people.person.takeOff", {
                template: template.name,
                person: person.firstName,
              })}
              onClick={() => void change(template, "takeOff")}
            >
              <X size={12} />
            </Button>
          </span>
        ))}
        {person.status === "ACTIVE" && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  className="h-9 rounded-full border-dashed"
                />
              }
            >
              {t("people.person.assignTemplate")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {remaining.length === 0 && (
                <DropdownMenuItem disabled>
                  {t("people.person.noTemplatesToAssign")}
                </DropdownMenuItem>
              )}
              {remaining.map((template) => (
                <DropdownMenuItem key={template.id} onClick={() => void change(template, "assign")}>
                  {template.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {person.status !== "ACTIVE" && !person.templates.length && (
          <span className="text-sm text-muted-foreground">{t("people.person.noTemplates")}</span>
        )}
      </div>
    </section>
  );
}
