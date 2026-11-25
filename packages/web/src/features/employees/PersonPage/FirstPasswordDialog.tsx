import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { type PersonPageQuery, TakeFirstPasswordDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";
import { useRestoredFromBackCache } from "@/lib/useRestoredFromBackCache";

type Props = { person: NonNullable<PersonPageQuery["employee"]>; onSaved: () => void };

/** Reads the password once and holds it in the dialog for the owner to copy. */
export function FirstPasswordDialog({ person, onSaved }: Props) {
  const [takePassword, { loading, reset }] = usePayloadMutation(TakeFirstPasswordDocument, {
    fetchPolicy: "no-cache",
  });
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);
  const lifetime = useRef(0);
  const { copied, copyFailed, copy } = useCopyToClipboard();
  useRestoredFromBackCache(onSaved);
  useEffect(() => {
    function clearOnLeave() {
      lifetime.current += 1;
      // Remove the plaintext from the document before the browser freezes it for Back.
      flushSync(() => setRevealed(null));
    }
    window.addEventListener("pagehide", clearOnLeave);
    return () => window.removeEventListener("pagehide", clearOnLeave);
  }, []);

  async function reveal() {
    const before = lifetime.current;
    try {
      const { email, password } = await takePassword({ variables: { employeeId: person.id } });
      if (lifetime.current !== before) return;
      if (email && password) {
        setRevealed({ email, password });
        return;
      }
      toast.error(t("people.firstPassword.readFailed"));
      onSaved();
    } catch {
      if (lifetime.current !== before) return;
      toast.error(t("people.firstPassword.readFailed"));
      onSaved();
    } finally {
      reset();
    }
  }

  function close() {
    setRevealed(null);
    onSaved();
  }

  if (!revealed) {
    if (!person.directoryProvision?.firstPasswordAvailable) return null;
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted px-4 py-3">
        <p className="text-sm">{t("people.firstPassword.ready")}</p>
        <Button type="button" disabled={loading} onClick={() => void reveal()}>
          {t("people.firstPassword.reveal")}
        </Button>
      </section>
    );
  }

  const { email, password } = revealed;
  return (
    <Dialog open disablePointerDismissal onOpenChange={(open) => !open && close()}>
      <DialogContent showCloseButton={false} className="gap-5 p-6 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {t("people.firstPassword.title", { name: person.firstName })}
          </DialogTitle>
          <DialogDescription>{email}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <p className="font-medium">{t("people.firstPassword.label")}</p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
            <code className="wrap-anywhere rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-base">
              {password}
            </code>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copy(password)}
              className="h-auto px-4"
            >
              {t(copied ? "people.firstPassword.copied" : "people.firstPassword.copy")}
            </Button>
          </div>
          {copyFailed && (
            <p role="alert" className="text-destructive">
              {t("people.firstPassword.copyFailed")}
            </p>
          )}
        </div>
        <div className="grid gap-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
          <strong className="font-semibold">{t("people.firstPassword.once")}</strong>
          <p>{t("people.firstPassword.changeAtSignIn")}</p>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={close} className="h-9">
            {t("people.firstPassword.saved")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
