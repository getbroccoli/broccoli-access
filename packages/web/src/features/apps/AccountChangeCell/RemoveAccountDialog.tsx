import type { AccountChangeCell_AppUserFragment } from "@/__generated__/graphql";
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
import { accountChangeActor } from "./accountChangeActor";
import { useChangeAccount } from "./useChangeAccount";

type Props = {
  account: Pick<AccountChangeCell_AppUserFragment, "id" | "email"> & {
    app: Parameters<typeof accountChangeActor>[0] & {
      containerConnection: {
        adminUrl: string | null;
        scan: { sourceName: string } | null;
      } | null;
    };
  };
  name: string | null;
  linked?: boolean;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

/** Confirms the irreversible removal with the account and its connected workspace. */
export function RemoveAccountDialog({
  account,
  name,
  open,
  onClose,
  onChanged,
  linked = false,
}: Props) {
  const { changeAccount, loading } = useChangeAccount();
  const app = account.app.name;
  const connection = account.app.containerConnection;
  const actor = accountChangeActor(account.app);
  const host = connection?.adminUrl && URL.parse(connection.adminUrl)?.hostname;
  const target = { accountId: account.id, name: name ?? account.email, app };
  const confirm = async () => {
    await changeAccount(target, "REMOVE");
    onClose();
    onChanged?.();
  };
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <AlertDialogContent className="gap-[18px] p-6 data-[size=default]:sm:max-w-[560px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-semibold">
            {t("apps.change.removeTitle", target)}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-border px-4 py-3.5 text-sm">
          <dt className="text-muted-foreground">
            {t(linked ? "apps.change.person" : "apps.page.account")}
          </dt>
          <dd className="break-words">
            {name && <strong>{name} </strong>}
            {account.email}
          </dd>
          <dt className="text-muted-foreground">{t("apps.change.app")}</dt>
          <dd className="font-semibold">{app}</dd>
          <dt className="text-muted-foreground">{t("apps.change.workspace")}</dt>
          <dd className="font-semibold">
            {connection?.scan?.sourceName ?? app}{" "}
            {host && <span className="font-normal text-muted-foreground">{host}</span>}
          </dd>
        </dl>
        <AlertDialogDescription className="flex flex-col gap-3">
          {actor && <span>{t("apps.change.actorLine", { actor })}</span>}
          <span className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 font-bold text-red-900">
            {t("apps.change.removeWarning")}
          </span>
        </AlertDialogDescription>
        <AlertDialogFooter className="m-0 border-0 bg-transparent p-0">
          <AlertDialogCancel disabled={loading}>{t("apps.change.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-800 text-white hover:bg-red-900"
            disabled={loading}
            onClick={() => void confirm()}
          >
            {t(loading ? "apps.change.removing" : "apps.change.confirmRemove", { app })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
