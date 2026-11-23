import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { type FormEvent, type ReactElement, useState } from "react";

import {
  type ConnectContainerConnectorDialog_ConnectorFragment,
  ConnectContainerConnectorDialog_ConnectorFragmentDoc,
  ConnectContainerConnectorDocument,
  ReconnectContainerConnectorDocument,
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

type Props = {
  connector: FragmentType<ConnectContainerConnectorDialog_ConnectorFragment>;
  /** The button that opens it; "Connect <app>" by default. */
  trigger?: ReactElement;
  /** Runs once the app is connected, for a page showing what only the server computes. */
  onConnected?: () => void;
};

/**
 * Connect <app>: a dialog asking for each value the connector needs, which the app then checks.
 * Once connected, it takes a new key instead, which also reconnects a connection that needs it.
 */
export function ConnectContainerConnectorDialog({ connector: from, trigger, onConnected }: Props) {
  const { data: connector, complete } = useFragment({
    fragment: ConnectContainerConnectorDialog_ConnectorFragmentDoc,
    from,
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const cache = useCache();
  const [connect, connecting] = usePayloadMutation(
    ConnectContainerConnectorDocument,
    // Connecting approves the app, which moves the app lists, their counts and the apps to connect.
    {
      update: (_cache, { data }) => {
        if (data?.connectors.connect.containerConnector) {
          forgetAppLists(cache);
        }
      },
    },
  );
  // The payload carries the connection's new status and its app's users' offers.
  const [reconnect, reconnecting] = usePayloadMutation(ReconnectContainerConnectorDocument);
  if (!complete) {
    return null;
  }
  const app = connector.name;
  const isNewKey = connector.connection !== null;
  const { loading, error, payloadError, reset } = isNewKey ? reconnecting : connecting;
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
    const saved = isNewKey
      ? reconnect({ variables: { input } })
      : connect({ variables: { input } });
    // `usePayloadMutation` keeps a failure for display, so the rejection needs no handling here.
    saved.then(
      () => {
        setOpen(false);
        onConnected?.();
      },
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
      <DialogTrigger
        render={
          trigger ?? (
            <Button type="button" size="lg" className="px-4">
              {t("settings.apps.connect", { app })}
            </Button>
          )
        }
      />
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-3 pr-8">
            <AppMark name={app} catalogKey={connector.id} className="size-9 rounded-lg text-base" />
            <DialogTitle className="text-xl font-semibold">
              {t(isNewKey ? "settings.apps.dialog.newKeyTitle" : "settings.apps.connect", { app })}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-foreground/80">
            {t(
              isNewKey
                ? "settings.apps.dialog.newKeyDescription"
                : "settings.apps.dialog.description",
              { app },
            )}
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
            <span>
              {t(isNewKey ? "settings.apps.dialog.newKeyNext" : "settings.apps.dialog.next", {
                app,
              })}
            </span>
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
            {submitLabel(app, { isNewKey, loading })}
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
    if (refusal.code === "wrong_workspace") {
      return t("settings.apps.dialog.otherWorkspace", { app });
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

/** The submit button's label: Connect <app>, or Check and save for a new key, while it runs too. */
function submitLabel(app: string, { isNewKey, loading }: { isNewKey: boolean; loading: boolean }) {
  if (isNewKey) {
    return t(loading ? "settings.apps.dialog.checking" : "settings.apps.dialog.checkAndSave");
  }
  return loading ? t("settings.apps.dialog.connecting") : t("settings.apps.connect", { app });
}
