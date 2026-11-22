import { useQuery } from "@apollo/client/react";
import { GoogleLogo } from "@phosphor-icons/react";
import { useState } from "react";

import { ConnectGoogleDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { t, type MessageKey } from "@/i18n";

import type { ConnectError } from "../connectSearch";
import { startGoogleConnection } from "../setupApi";
import { GoogleCloudSteps } from "./GoogleCloudSteps";
import { HowToConnect } from "./HowToConnect";
import { RedirectAddress } from "./RedirectAddress";

const CONNECT_ERROR_MESSAGES: Record<ConnectError, MessageKey> = {
  cancelled: "setup.connect.cancelled",
  not_super_admin: "setup.connect.notSuperAdmin",
  failed: "setup.connect.failed",
};

type Props = {
  /** Why the last connection failed, from Google's redirect back. */
  connectError: ConnectError | undefined;
};

/**
 * Setup's first step: the admin makes their own Google app, pastes its client ID and secret, and
 * leaves for Google's consent page; Google's answer comes back to the API, which signs them in.
 */
export function ConnectGoogleStep({ connectError }: Props) {
  const { data, error, refetch } = useQuery(ConnectGoogleDocument);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const isFilledIn = clientId.trim() !== "" && clientSecret.trim() !== "";
  const failure = startFailed
    ? "setup.connect.startFailed"
    : connectError && CONNECT_ERROR_MESSAGES[connectError];

  const connect = async () => {
    setStarting(true);
    setStartFailed(false);
    const authorizationUrl = await startGoogleConnection(clientId, clientSecret);
    if (authorizationUrl) {
      window.location.assign(authorizationUrl);
      return;
    }
    setStarting(false);
    setStartFailed(true);
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        void connect();
      }}
    >
      <HowToConnect />
      <div className="flex flex-col gap-6 rounded-xl border border-border p-5 sm:p-7">
        {data ? (
          <RedirectAddress address={data.setup.googleRedirectAddress} />
        ) : error ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-sm text-destructive">{t("setup.connect.loadFailed")}</p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              {t("setup.connect.retry")}
            </Button>
          </div>
        ) : (
          <Skeleton className="h-[72px] rounded-lg" />
        )}
        <GoogleCloudSteps />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="google-client-id">{t("setup.connect.clientId")}</Label>
            <Input
              id="google-client-id"
              autoComplete="off"
              spellCheck={false}
              readOnly={starting}
              className="h-11 rounded-lg px-4"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="google-client-secret">{t("setup.connect.clientSecret")}</Label>
            <Input
              id="google-client-secret"
              type="password"
              autoComplete="off"
              spellCheck={false}
              readOnly={starting}
              className="h-11 rounded-lg px-4"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-3">
        <Button
          type="submit"
          size="lg"
          className="h-12 gap-2.5 rounded-xl px-5 text-base"
          disabled={!isFilledIn || starting}
          aria-describedby="google-connect-hint"
        >
          <GoogleLogo weight="bold" className="size-5" aria-hidden />
          {starting ? t("setup.connect.submitting") : t("setup.connect.submit")}
        </Button>
        <p id="google-connect-hint" className="text-sm text-muted-foreground">
          {t("setup.connect.submitHint")}
        </p>
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {t(failure)}
          </p>
        )}
      </div>
    </form>
  );
}
