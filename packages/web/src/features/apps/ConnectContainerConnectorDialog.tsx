import { type FormEvent, useState } from "react";

import {
  ConnectContainerConnectorDocument,
  type ContainerConnectorsSettingsQuery,
} from "@/__generated__/graphql";
import { useCache, usePayloadMutation } from "@/apollo";
import { AppMark } from "@/components/AppMark";
import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

import { forgetAppLists } from "./cache";
import { inSentence } from "./connectingFieldName";

type Connector = ContainerConnectorsSettingsQuery["containerConnectors"][number];

type Props = {
  connector: Pick<Connector, "id" | "name" | "connectionFields">;
};

/** Connect <app>: a dialog asking for each value the connector needs, which the app then checks. */
export function ConnectContainerConnectorDialog({ connector }: Props) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const cache = useCache();
  const [connect, { loading, error, payloadError, reset }] = usePayloadMutation(
    ConnectContainerConnectorDocument,
    // Connecting approves the app, which moves the app lists and their counts.
    {
      update: (_cache, { data }) => {
        if (data?.connectors.connect.containerConnector) {
          forgetAppLists(cache);
        }
      },
    },
  );
  const app = connector.name;
  const changeOpen = (next: boolean) => {
    // Closed only once the check ends, so a pending connect never runs behind another try.
    if (loading) {
      return;
    }
    setOpen(next);
    setValues({});
    reset();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = {
      connector: connector.id,
      values: connector.connectionFields.map(({ key }) => ({ key, value: values[key] ?? "" })),
    };
    // `usePayloadMutation` keeps a failure for display, so the rejection needs no handling here.
    connect({ variables: { input } }).then(
      () => setOpen(false),
      () => undefined,
    );
  };
  const fieldErrors = payloadError?.__typename === "InvalidInputError" ? payloadError.fields : [];
  const fieldError = (key: string, label: string) =>
    fieldErrors.some(({ field }) => field === `values.${key}`)
      ? t("settings.apps.dialog.required", { field: inSentence(label) })
      : undefined;
  const formError = connectFailure(app, payloadError, error !== undefined);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button type="button" size="lg" className="px-4" />}>
        {t("settings.apps.connect", { app })}
      </DialogTrigger>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-3 pr-8">
            <AppMark name={app} catalogKey={connector.id} className="size-9 rounded-lg text-base" />
            <DialogTitle className="text-xl font-semibold">
              {t("settings.apps.connect", { app })}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-foreground/80">
            {t("settings.apps.dialog.description", { app })}
          </DialogDescription>
        </DialogHeader>
        <form id={`connect-${connector.id}`} onSubmit={submit} className="flex flex-col gap-5">
          {connector.connectionFields.map(({ key, label, help, secret }) => {
            const id = `connect-${connector.id}-${key}`;
            const message = fieldError(key, label);
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type={secret ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 rounded-lg"
                  value={values[key] ?? ""}
                  onChange={(event) => setValues({ ...values, [key]: event.target.value })}
                  aria-invalid={message !== undefined}
                  aria-describedby={message ? `${id}-error` : `${id}-hint`}
                />
                <FieldError id={`${id}-error`} message={message} />
                {!message && (
                  <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                    {secret ? t("settings.apps.dialog.secretHint", { help }) : help}
                  </p>
                )}
              </div>
            );
          })}
          <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3.5 py-3 text-sm text-foreground/80">
            <span className="font-semibold text-foreground">
              {t("settings.apps.dialog.nextTitle")}
            </span>
            <span>{t("settings.apps.dialog.next", { app })}</span>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </form>
        <DialogFooter className="m-0 flex-row justify-end gap-2 border-0 bg-transparent p-0">
          <DialogClose
            render={<Button type="button" variant="outline" size="lg" disabled={loading} />}
          >
            {t("settings.apps.dialog.cancel")}
          </DialogClose>
          <Button type="submit" form={`connect-${connector.id}`} size="lg" disabled={loading}>
            {loading ? t("settings.apps.dialog.connecting") : t("settings.apps.connect", { app })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Why connecting failed, for the whole form: the app refused the values, or could not answer. */
function connectFailure(
  app: string,
  payloadError: { __typename: string; fields?: { field: string; code: string }[] } | null,
  failedOtherwise: boolean,
): string | undefined {
  if (payloadError?.__typename === "InvalidInputError") {
    const refusal = payloadError.fields?.find(({ field }) => field === "values");
    if (!refusal) {
      return undefined;
    }
    return refusal.code === "permission_missing"
      ? t("settings.apps.dialog.notAdmin", { app })
      : t("settings.apps.dialog.refused", { app });
  }
  if (payloadError?.__typename === "UnavailableError") {
    return t("settings.apps.dialog.unavailable", { app });
  }
  return payloadError || failedOtherwise ? t("settings.apps.dialog.failed", { app }) : undefined;
}
