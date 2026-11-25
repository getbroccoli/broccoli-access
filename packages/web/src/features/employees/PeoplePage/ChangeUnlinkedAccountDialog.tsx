import { useChangeAccount } from "@/features/apps";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { t } from "@/i18n";

type Props = {
  account: { id: string; email: string; app: { name: string } };
  action: "SUSPEND" | "REACTIVATE";
  /** Reads the row again: the answer carries no account without an employee. */
  onAsked: () => Promise<unknown>;
  onClose: () => void;
};

/** Confirms Disable or Enable by the account's email when it has no employee to name. */
export function ChangeUnlinkedAccountDialog({ account, action, onAsked, onClose }: Props) {
  const { changeAccount, loading } = useChangeAccount("people.accounts.changeRefused");
  const target = { name: account.email, app: account.app.name };
  const copy = COPY[action];
  async function ask() {
    await changeAccount({ ...target, accountId: account.id }, action);
    onClose();
    // Asked or refused, the row is no longer what the list last read.
    await onAsked();
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(copy.title, target)}</AlertDialogTitle>
          <AlertDialogDescription>{t(copy.effect)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("apps.change.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={loading} onClick={() => void ask()}>
            {t(copy.confirm, target)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Disable's and Enable's words, which mirror each other. */
const COPY = {
  SUSPEND: {
    title: "apps.change.disableTitle",
    effect: "apps.change.disableEffect",
    confirm: "apps.change.confirmDisable",
  },
  REACTIVATE: {
    title: "apps.change.enableTitle",
    effect: "apps.change.enableEffect",
    confirm: "apps.change.confirmEnable",
  },
} as const;
