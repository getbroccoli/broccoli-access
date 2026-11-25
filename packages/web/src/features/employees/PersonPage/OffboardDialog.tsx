import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  OffboardEmployeeDocument,
  PersonPageDocument,
  type PersonPageQuery,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";
import { useRestoredFromBackCache } from "@/lib/useRestoredFromBackCache";
import {
  askGoogleForUserWrites,
  type GoogleUserWritesOutcome,
  useGoogleUserWrites,
} from "@/lib/useGoogleUserWrites";

import { BY_HAND_REASONS } from "./byHandReasons";
import { activeAccountsToRemove } from "./removeAllOffers";

type Person = NonNullable<PersonPageQuery["employee"]>;

type Props = {
  person: Person;
  onClose: () => void;
  /** How Google's consent ended, when the owner just came back from it. */
  googleUserWrites: GoogleUserWritesOutcome | undefined;
  /** The apps unticked before the trip to Google's consent; none on a new offboarding. */
  initialSkippedAppIds: readonly string[];
};

/**
 * Offboard, confirmed: the accounts Broccoli Access disables now, the directory's first, each of
 * which the owner can untick, and what is left to do by hand. The first offboarding that suspends
 * in Google goes through Google's consent, and nobody is offboarded until the owner confirms here
 * again.
 */
export function OffboardDialog({ person, onClose, googleUserWrites, initialSkippedAppIds }: Props) {
  const [skippedAppIds, setSkippedAppIds] = useState(initialSkippedAppIds);
  const [goingToGoogle, setGoingToGoogle] = useState(false);
  // Back from Google without an answer can restore this page as it was left, still waiting.
  const stopWaiting = useCallback(() => setGoingToGoogle(false), []);
  useRestoredFromBackCache(stopWaiting);
  const google = useGoogleUserWrites();
  const [offboard, offboarding] = usePayloadMutation(OffboardEmployeeDocument, {
    refetch: [PersonPageDocument],
  });
  const { accountsToDisable, accountsToRemove, byHandWork } = person.offboarding;
  const removeLater = new Set(activeAccountsToRemove(accountsToRemove).map(({ app }) => app.name));
  const directoryAppId = person.directoryAccount?.app.id;
  // An app with two accounts of theirs shows once: unticking it keeps both. With the shared
  // Google app, which cannot ask Google for the permission, suspending is the owner's work.
  const apps = [...new Map(accountsToDisable.map(({ app }) => [app.id, app])).values()].filter(
    ({ id }) => google !== "unsupported" || id !== directoryAppId,
  );
  const googleByHand =
    google === "unsupported" &&
    apps.length < new Set(accountsToDisable.map(({ app }) => app.id)).size;
  const tickedAppIds = apps.map(({ id }) => id).filter((id) => !skippedAppIds.includes(id));
  const suspendsInGoogle = directoryAppId !== undefined && tickedAppIds.includes(directoryAppId);
  const asksGoogle = suspendsInGoogle && google === "needs_consent";
  // Suspending waits until Google's permission is known; Cancel never does.
  const googleUnknown = suspendsInGoogle && (google === "loading" || google === "failed");
  const busy = offboarding.loading || goingToGoogle;
  const toggle = (appId: string) =>
    setSkippedAppIds((skipped) =>
      skipped.includes(appId) ? skipped.filter((id) => id !== appId) : [...skipped, appId],
    );
  const confirm = async () => {
    if (asksGoogle) {
      setGoingToGoogle(true);
      // The unticked apps come back with the owner, so the consent never ticks one again.
      const skip = skippedAppIds.length ? `&skip=${skippedAppIds.join("_")}` : "";
      if (!(await askGoogleForUserWrites(`/people/${person.id}?offboard=true${skip}`))) {
        setGoingToGoogle(false);
        toast.error(t("people.offboard.googleStartFailed"));
      }
      return;
    }
    try {
      await offboard({ variables: { input: { employeeId: person.id, appIds: tickedAppIds } } });
      onClose();
    } catch {
      toast.error(t("people.offboard.failed", { name: person.firstName }));
    }
  };
  const refusal = googleUserWrites && googleUserWrites !== "allowed" && REFUSALS[googleUserWrites];

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8 text-xl font-semibold">
            {t("people.offboard.title", { name: `${person.firstName} ${person.lastName}` })}
          </DialogTitle>
          <DialogDescription>{person.email}</DialogDescription>
        </DialogHeader>
        {apps.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t("people.offboard.disablesNow")}</h3>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {apps.map((app) => (
                <li key={app.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 cursor-pointer accent-foreground"
                      checked={!skippedAppIds.includes(app.id)}
                      disabled={busy}
                      onChange={() => toggle(app.id)}
                    />
                    <span className="w-40 font-medium">{app.name}</span>
                    <span className="text-foreground/70">
                      {t(
                        app.id === directoryAppId
                          ? "people.offboard.suspend"
                          : "apps.change.disable",
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(byHandWork.length > 0 || googleByHand) && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t("people.offboard.byHand")}</h3>
            <ul className="divide-y divide-amber-200 rounded-xl border border-amber-200 bg-amber-50 text-amber-950">
              {googleByHand && person.directoryAccount && (
                <li className="flex gap-3 px-4 py-3 text-sm">
                  <span className="w-40 font-medium">{person.directoryAccount.app.name}</span>
                  <span>{t("people.offboard.needsOwnGoogleApp")}</span>
                </li>
              )}
              {byHandWork.map(({ app, reason }) => (
                <li key={`${app.id} ${reason}`} className="flex gap-3 px-4 py-3 text-sm">
                  <span className="w-40 font-medium">{app.name}</span>
                  <span>{t(BY_HAND_REASONS[reason])}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {removeLater.size > 0 && (
          <p className="text-sm text-foreground/80">
            {t("people.offboard.removeLater", { apps: [...removeLater].join(", ") })}
          </p>
        )}
        <p className="text-sm text-foreground/80">{t("people.offboard.note")}</p>
        {asksGoogle && (
          <p className="text-sm text-foreground/80">{t("people.offboard.googleAsks")}</p>
        )}
        {googleUnknown && google === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            {t("people.offboard.googleCheckFailed")}
          </p>
        )}
        {refusal && (
          <p role="alert" className="text-sm text-destructive">
            {t(refusal)}
          </p>
        )}
        <DialogFooter className="m-0 flex-row justify-end gap-2 border-0 bg-transparent p-0">
          <DialogClose
            render={<Button type="button" variant="outline" size="lg" disabled={busy} />}
          >
            {t("apps.change.cancel")}
          </DialogClose>
          <Button
            type="button"
            size="lg"
            disabled={busy || googleUnknown}
            onClick={() => void confirm()}
          >
            {asksGoogle
              ? t("people.offboard.continueToGoogle")
              : t("people.offboard.confirm", { name: person.firstName })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Why Google's consent left users unchangeable, in the owner's words. */
const REFUSALS = {
  cancelled: "people.offboard.googleCancelled",
  permission_refused: "people.offboard.googleRefused",
  not_super_admin: "people.offboard.googleNotSuperAdmin",
  other_workspace: "people.offboard.googleOtherWorkspace",
  failed: "people.offboard.googleFailed",
} as const;
