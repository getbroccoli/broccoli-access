import { toast } from "sonner";

import {
  type AccountChangeAction,
  MarkAccountChangeDoneByHandDocument,
  PersonPageDocument,
  AppPageDocument,
  PeopleDifferencesDocument,
  TemplatesPageDocument,
} from "@/__generated__/graphql";
import { useCache, usePayloadMutation } from "@/apollo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { t } from "@/i18n";

import { forgetAccessCounts } from "../cache";

type Props = {
  open: boolean;
  /** Closes it: "Not yet", or once the change is marked. */
  onClose: () => void;
  /** Once the change is marked, for a row the answer does not carry. */
  onDone?: () => void;
  /** The failed change the owner made in the app themselves. */
  change: { id: string; action: AccountChangeAction };
  person: { name: string; firstName: string };
  app: string;
  /** False for an app without a connection, which no scan will check. */
  connected?: boolean;
};

/**
 * "I did it by hand", confirmed: the change becomes done by hand and the account takes its new
 * status at once, which changes the "still have access" counts elsewhere; an invite shows Invited.
 */
export function DoneByHandDialog({
  open,
  onClose,
  onDone,
  change,
  person,
  app,
  connected = true,
}: Props) {
  const cache = useCache();
  const [markDoneByHand, { loading }] = usePayloadMutation(MarkAccountChangeDoneByHandDocument, {
    refetch: [
      PersonPageDocument,
      PeopleDifferencesDocument,
      TemplatesPageDocument,
      ...(change.action === "REMOVE" ? [AppPageDocument] : []),
    ],
  });
  const copy = COPY[change.action];
  const confirm = async () => {
    try {
      await markDoneByHand({ variables: { input: { id: change.id } } });
      forgetAccessCounts(cache);
      onClose();
      onDone?.();
    } catch {
      toast.error(t(copy.refused, { name: person.name, app }));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialogContent className="p-6 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-semibold">
            {t(copy.title, { name: person.name, app })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(connected ? copy.effect : "apps.byHand.inviteEffectNoConnection", {
              firstName: person.firstName,
              app,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="m-0 border-0 bg-transparent p-0">
          <AlertDialogCancel size="lg" className="px-4">
            {t("apps.byHand.notYet")}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            size="lg"
            className="px-4"
            disabled={loading}
            onClick={() => void confirm()}
          >
            {t("apps.byHand.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The words for a Disable, an Enable or an Invite done by hand. */
const COPY = {
  SUSPEND: {
    title: "apps.byHand.disableTitle",
    effect: "apps.byHand.disableEffect",
    refused: "apps.byHand.refused",
  },
  REACTIVATE: {
    title: "apps.byHand.enableTitle",
    effect: "apps.byHand.enableEffect",
    refused: "apps.byHand.refused",
  },
  REMOVE: {
    title: "apps.byHand.removeTitle",
    effect: "apps.byHand.removeEffect",
    refused: "apps.byHand.refused",
  },
  INVITE: {
    title: "apps.byHand.inviteTitle",
    effect: "apps.byHand.inviteEffect",
    refused: "apps.byHand.inviteRefused",
  },
} as const;
