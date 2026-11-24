import { useQuery } from "@apollo/client/react";
import { GoogleLogo } from "@phosphor-icons/react";
import { useState } from "react";

import { ConnectGoogleDocument, type GoogleApp } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { t, type MessageKey } from "@/i18n";

import { type GoogleConsentPath, startGoogleConsent } from "../setupApi";
import { GoogleCloudSteps } from "./GoogleCloudSteps";
import { HowToConnect } from "./HowToConnect";
import { RedirectAddress } from "./RedirectAddress";

type Props = {
  /** Where the API starts Google's consent with the client. */
  consentPath: GoogleConsentPath;
  /** Why the last consent failed, from Google's redirect back. */
  failure: MessageKey | undefined;
};

/**
 * The choice of Google app, with credentials only for the admin's own app, followed by consent.
 */
export function GoogleAppForm({ consentPath, failure }: Props) {
  const { data, error, refetch } = useQuery(ConnectGoogleDocument, {
    variables: { changingApp: consentPath === "/api/google/change-app" },
  });
  const [choice, setChoice] = useState<GoogleApp | null>(null);
  const available = data?.setup.broccoliGoogleAppAvailable ?? false;
  const defaultApp = data?.setup.googleWorkspace?.googleApp ?? "BROCCOLI_GOOGLE_APP";
  const googleApp = choice ?? (available ? defaultApp : "OWN_GOOGLE_APP");
  const ownApp = googleApp === "OWN_GOOGLE_APP";
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const isFilledIn = !ownApp || (clientId.trim() !== "" && clientSecret.trim() !== "");
  const shownFailure = startFailed ? "setup.connect.startFailed" : failure;

  const connect = async () => {
    if (!data || !isFilledIn || starting) return;
    setStarting(true);
    setStartFailed(false);
    const authorizationUrl = await startGoogleConsent(
      consentPath,
      googleApp,
      ownApp ? { clientId, clientSecret } : {},
    );
    if (authorizationUrl) {
      window.location.assign(authorizationUrl);
      return;
    }
    setStarting(false);
    setStartFailed(true);
  };

  if (!data)
    return error ? (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-destructive">{t("setup.connect.loadFailed")}</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          {t("setup.connect.retry")}
        </Button>
      </div>
    ) : (
      <Skeleton className="h-64 rounded-xl" />
    );

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        void connect();
      }}
    >
      <HowToConnect
        selected={googleApp}
        onSelect={setChoice}
        available={available}
        disabled={starting}
      />
      {ownApp && (
        <div className="flex flex-col gap-6 rounded-xl border border-border p-5 sm:p-7">
          <RedirectAddress address={data.setup.googleRedirectAddress} />
          <GoogleCloudSteps />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="google-client-id">{t("setup.connect.clientId")}</Label>
              <Input
                id="google-client-id"
                autoComplete="off"
                spellCheck={false}
                disabled={starting}
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
                disabled={starting}
                className="h-11 rounded-lg px-4"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
              />
            </div>
          </div>
        </div>
      )}
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
        {shownFailure && (
          <p role="alert" className="text-sm text-destructive">
            {t(shownFailure)}
          </p>
        )}
      </div>
    </form>
  );
}
