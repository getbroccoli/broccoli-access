import { useQuery } from "@apollo/client/react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import {
  AddPersonDocument,
  AddPersonFormDocument,
  AddPersonTemplatesDocument,
  ProvisionEmployeeDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import {
  askGoogleForUserWrites,
  googleConsentAvailable,
  GOOGLE_WORKSPACE,
} from "@/lib/useGoogleUserWrites";

type Props = { onClose: () => void; onAdded: (employeeId: string) => void };

/** Adds a person and their templates before Provision opens the Google consent. */
export function AddPersonDialog({ onClose, onAdded }: Props) {
  const form = useQuery(AddPersonFormDocument, { fetchPolicy: "cache-and-network" });
  const picker = useQuery(AddPersonTemplatesDocument, { fetchPolicy: "cache-and-network" });
  const [add, mutation] = usePayloadMutation(AddPersonDocument);
  const [provision] = usePayloadMutation(ProvisionEmployeeDocument);
  const [submitting, setSubmitting] = useState(false);
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const invalidFields =
    mutation.payloadError?.__typename === "InvalidInputError" ? mutation.payloadError.fields : [];
  const inputError = invalidFields.some(({ field, code }) => field === "email" && code === "taken")
    ? "people.add.emailTaken"
    : invalidFields.some(({ field }) => field === "firstName")
      ? "people.add.enterFirstName"
      : invalidFields.some(({ field }) => field === "lastName")
        ? "people.add.enterLastName"
        : null;
  const { googleWorkspace: google, broccoliGoogleAppAvailable = false } = form.data?.setup ?? {};
  const canProvision =
    google && googleConsentAvailable(google.googleApp, broccoliGoogleAppAvailable);
  const templateWindow = picker.data?.templates;
  const templates = templateWindow?.edges.map(({ node }) => node) ?? [];
  const selectedApps = templates
    .filter(({ id }) => templateIds.includes(id))
    .flatMap(({ apps }) => apps.filter(({ app }) => app.catalogKey !== GOOGLE_WORKSPACE));
  const byApp = Map.groupBy(selectedApps, ({ app }) => app.id);
  const appIds = [...byApp.keys()];
  const appsByHand = [...byApp.values()]
    .map((rows) => rows[0]!.app)
    .filter(({ containerConnection }) => !containerConnection)
    .map(({ name }) => name);
  const hasAutomaticInvites = appIds.length > appsByHand.length;
  const roleConflict = [...byApp.values()].some(
    (rows) => new Set(rows.map(({ role }) => role)).size > 1,
  );
  const toggle = (id: string) =>
    setTemplateIds((before) =>
      before.includes(id) ? before.filter((item) => item !== id) : [...before, id],
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!google || submitting) return;
    const fields = readPersonFields(event.currentTarget, google.domain);
    if (!fields) return;
    setFailed(false);
    setSubmitting(true);
    try {
      const { employee } = await add({ variables: { input: { ...fields, templateIds } } });
      if (!employee) {
        setFailed(true);
        return;
      }
      if (canProvision && google.canChangeUsers && !roleConflict) {
        await provision({ variables: { input: { employeeId: employee.id, appIds } } }).catch(() =>
          toast.error(t("people.add.provisionFailed")),
        );
      } else if (canProvision && !roleConflict) {
        if (await askGoogleForUserWrites(`/people/${employee.id}?provision=true`)) return;
        toast.error(t("people.offboard.googleStartFailed"));
      }
      onAdded(employee.id);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  function moreTemplates() {
    void picker
      .fetchMore({
        variables: { after: templateWindow?.pageInfo.endCursor },
        updateQuery: (previous, { fetchMoreResult }) => ({
          templates: {
            ...fetchMoreResult.templates,
            edges: [...previous.templates.edges, ...fetchMoreResult.templates.edges],
          },
        }),
      })
      .catch(() => toast.error(t("people.add.loadFailed")));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-[560px]"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{t("people.add.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="grid gap-5">
          <PersonFields domain={google?.domain} disabled={submitting} />
          <TemplatePicker
            templates={templates}
            selectedIds={templateIds}
            disabled={submitting}
            loading={picker.loading}
            onToggle={toggle}
            onMore={templateWindow?.pageInfo.hasNextPage ? moreTemplates : undefined}
            onRetry={
              picker.error && !picker.data
                ? () => void picker.refetch().catch(() => undefined)
                : undefined
            }
          />
          <DialogDescription className="text-foreground/80">
            {t(
              google && !canProvision
                ? "apps.change.googleRelayUnavailable"
                : roleConflict
                  ? "people.add.resolveRoles"
                  : hasAutomaticInvites
                    ? "people.add.summaryApps"
                    : "people.add.summary",
            )}
            {canProvision &&
              !roleConflict &&
              appsByHand.length > 0 &&
              ` ${t("people.add.byHandSummary", { apps: appsByHand.join(", ") })}`}
            {canProvision &&
              !google?.canChangeUsers &&
              !roleConflict &&
              ` ${t("people.add.beforeConsent")}`}
          </DialogDescription>
          {form.error && !form.data && (
            <div role="alert" className="text-destructive">
              {t("people.add.loadFailed")}{" "}
              <Button
                type="button"
                variant="link"
                onClick={() => void form.refetch().catch(() => undefined)}
              >
                {t("templates.retry")}
              </Button>
            </div>
          )}
          {failed && (
            <p role="alert" className="text-destructive">
              {inputError
                ? t(inputError)
                : (mutation.payloadError?.message ?? t("people.add.failed"))}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={onClose}
              className="h-9"
            >
              {t("apps.change.cancel")}
            </Button>
            <Button type="submit" disabled={!google || submitting} className="h-9">
              {t(!canProvision || roleConflict ? "people.add.title" : "people.add.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type TemplatePickerProps = {
  templates: readonly { id: string; name: string }[];
  selectedIds: readonly string[];
  disabled: boolean;
  loading: boolean;
  onToggle: (id: string) => void;
  onMore?: () => void;
  onRetry?: () => void;
};

function TemplatePicker({
  templates,
  selectedIds,
  disabled,
  loading,
  onToggle,
  onMore,
  onRetry,
}: TemplatePickerProps) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 font-medium">{t("templates.title")}</legend>
      <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto">
        {templates.map(({ id, name }) => (
          <label
            key={id}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 has-checked:border-foreground has-checked:bg-muted/40"
          >
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={selectedIds.includes(id)}
              onChange={() => onToggle(id)}
            />
            <span className="min-w-0 wrap-anywhere">{name}</span>
          </label>
        ))}
      </div>
      {loading && !templates.length && (
        <p className="text-muted-foreground">{t("people.add.loading")}</p>
      )}
      {onMore && (
        <Button type="button" variant="link" onClick={onMore} disabled={loading}>
          {t("people.person.moreTemplates")}
        </Button>
      )}
      {onRetry && (
        <Button type="button" variant="link" onClick={onRetry}>
          {t("templates.retry")}
        </Button>
      )}
    </fieldset>
  );
}

type PersonFieldsProps = { domain: string | undefined; disabled: boolean };

function PersonFields({ domain, disabled }: PersonFieldsProps) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 font-medium">
          {t("people.add.firstName")}
          <Input
            name="firstName"
            autoComplete="off"
            required
            disabled={disabled}
            className="h-10"
          />
        </label>
        <label className="grid gap-1.5 font-medium">
          {t("people.add.lastName")}
          <Input name="lastName" autoComplete="off" required disabled={disabled} className="h-10" />
        </label>
      </div>
      <label className="grid gap-1.5 font-medium">
        {t("people.add.email")}
        <span className="flex h-10 items-center overflow-hidden rounded-lg border border-input focus-within:ring-2 focus-within:ring-ring/50">
          <Input
            name="email"
            aria-describedby="add-person-email-domain"
            autoComplete="off"
            pattern="[^@\s]+"
            required
            disabled={disabled}
            className="h-full min-w-0 border-0 focus-visible:ring-0"
          />
          <span
            className="flex h-full shrink-0 items-center border-l border-border bg-muted/40 px-3 text-muted-foreground"
            id="add-person-email-domain"
          >
            {domain && `@${domain}`}
          </span>
        </span>
      </label>
    </>
  );
}

function readPersonFields(form: HTMLFormElement, domain: string) {
  const fields = new FormData(form);
  const firstName = fields.get("firstName");
  const lastName = fields.get("lastName");
  const localPart = fields.get("email");
  if (
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    typeof localPart !== "string"
  )
    return null;
  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: `${localPart.trim()}@${domain}`,
  };
}
