import { type FormEvent, useCallback, useState } from "react";

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
import { t, type MessageKey } from "@/i18n";
import { postJson } from "@/lib/postJson";
import { useRestoredFromBackCache } from "@/lib/useRestoredFromBackCache";

type Props = {
  /** The workspace's domain, which the address is in. */
  domain: string;
};

/**
 * Create the integration user: the owner picks its address, then goes to Google to allow creating
 * users; Google's answer comes back to the API, which creates it and returns to Connections.
 */
export function CreateIntegrationUserDialog({ domain }: Props) {
  const [open, setOpen] = useState(false);
  const [localPart, setLocalPart] = useState(DEFAULT_LOCAL_PART);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<StartFailure | null>(null);

  // Back from Google can restore this page as it was left, still waiting for a start that ended.
  const stopWaiting = useCallback(() => setStarting(false), []);
  useRestoredFromBackCache(stopWaiting);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStarting(true);
    setFailure(null);
    const started = await startCreation(`${localPart.trim()}@${domain}`);
    if ("authorizationUrl" in started) {
      window.location.assign(started.authorizationUrl);
      return;
    }
    setStarting(false);
    setFailure(started.failure);
  };
  const changeOpen = (next: boolean) => {
    // Closed only once the start ends, so a dismissed dialog never sends the owner to Google.
    if (starting) {
      return;
    }
    setOpen(next);
    setFailure(null);
  };
  const addressError = failure === "invalid_address" ? t(START_FAILURES[failure]) : undefined;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="lg" className="shrink-0 px-4">
            {t("settings.integrationUser.create")}
          </Button>
        }
      />
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8 text-xl font-semibold">
            {t("settings.integrationUser.dialogTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          id="create-integration-user"
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-1.5"
        >
          <Label htmlFor="integration-user-address">{t("settings.integrationUser.address")}</Label>
          <div className="flex items-center overflow-hidden rounded-lg border border-input focus-within:ring-2 focus-within:ring-ring">
            <Input
              id="integration-user-address"
              autoComplete="off"
              spellCheck={false}
              readOnly={starting}
              className="h-10 min-w-0 flex-1 rounded-none border-0 shadow-none focus-visible:ring-0"
              value={localPart}
              onChange={(event) => setLocalPart(event.target.value)}
              aria-invalid={addressError !== undefined}
              aria-describedby={
                addressError ? "integration-user-address-error" : "integration-user-domain"
              }
            />
            <span
              id="integration-user-domain"
              className="flex h-10 items-center border-l border-border bg-muted px-3 text-sm text-muted-foreground"
            >
              @{domain}
            </span>
          </div>
          <FieldError id="integration-user-address-error" message={addressError} />
        </form>
        <DialogDescription className="text-sm text-muted-foreground">
          {t("settings.integrationUser.dialogNote")}
        </DialogDescription>
        {failure && failure !== "invalid_address" && (
          <p role="alert" className="text-sm text-destructive">
            {t(START_FAILURES[failure])}
          </p>
        )}
        <DialogFooter className="m-0 flex-row justify-end gap-2 border-0 bg-transparent p-0">
          <DialogClose
            render={<Button type="button" variant="outline" size="lg" disabled={starting} />}
          >
            {t("settings.integrationUser.cancel")}
          </DialogClose>
          <Button type="submit" form="create-integration-user" size="lg" disabled={starting}>
            {t("settings.integrationUser.continueToGoogle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The address the design proposes, which the owner may change. */
const DEFAULT_LOCAL_PART = "broccoli";

/** Why the consent did not start: the API refused the address, or anything else. */
type StartFailure = "invalid_address" | "failed";

const START_FAILURES: Record<StartFailure, MessageKey> = {
  invalid_address: "settings.integrationUser.invalidAddress",
  failed: "settings.integrationUser.startFailed",
};

const BAD_REQUEST = 400;

/** Starts Google's consent to create users for `email`: the consent page's address, or why not. */
async function startCreation(
  email: string,
): Promise<{ authorizationUrl: string } | { failure: StartFailure }> {
  try {
    const response = await postJson("/api/google/integration-user", { email });
    if (response.ok) {
      return (await response.json()) as { authorizationUrl: string };
    }
    return { failure: response.status === BAD_REQUEST ? "invalid_address" : "failed" };
  } catch {
    return { failure: "failed" };
  }
}
