import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";

import {
  EditAccountNoteDocument,
  MarkAccountDocument,
  type MarkedAccountKind,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

import { ACCOUNT_NOTE_MAX_LENGTH, accountNoteProblem } from "../accountNote";
import { removeAccountWithoutPerson } from "../cache";

type Props = {
  account: { id: string; email: string; note?: string | null };
  kind?: MarkedAccountKind;
  onClose: () => void;
  refresh: () => Promise<unknown>;
  onMarked?: () => Promise<unknown>;
};

/** The owner's explanation of a new mark, or a correction to an existing note. */
export function AccountNoteDialog({ account, kind, onClose, refresh, onMarked }: Props) {
  const [note, setNote] = useState(account.note ?? "");
  const inputId = useId();
  const [mark, marking] = usePayloadMutation(MarkAccountDocument, {
    update(cache, { data }) {
      const id = data?.apps.markAccount.account?.id;
      if (id) removeAccountWithoutPerson(cache, id);
    },
  });
  const [edit, editing] = usePayloadMutation(EditAccountNoteDocument);
  const saving = marking.loading || editing.loading;
  const problem = accountNoteProblem(note);
  const title =
    kind === "SERVICE"
      ? "people.accounts.markService"
      : kind === "EXTERNAL"
        ? "people.accounts.markExternal"
        : "people.accounts.editNote";
  async function save(event: FormEvent) {
    event.preventDefault();
    if (problem || saving) return;
    const input = { appAccountId: account.id, note };
    try {
      if (kind) await mark({ variables: { input: { ...input, kind } } });
      else await edit({ variables: { input } });
      onClose();
      if (kind) await onMarked?.();
    } catch (error) {
      if (error instanceof PayloadFailure) {
        onClose();
        await refresh();
      }
      toast.error(t("people.accounts.noteFailed"));
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent aria-describedby={inputId + "-email"}>
        <DialogTitle>{t(title)}</DialogTitle>
        <p id={inputId + "-email"} className="break-all text-sm text-muted-foreground">
          {account.email}
        </p>
        <form onSubmit={(event) => void save(event)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={inputId}>{t("people.accounts.note")}</Label>
            <Input
              id={inputId}
              autoFocus
              required
              aria-invalid={problem === "tooLong"}
              aria-describedby={problem === "tooLong" ? inputId + "-problem" : undefined}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            {problem === "tooLong" && (
              <p id={inputId + "-problem"} role="alert" className="text-sm text-destructive">
                {t("people.accounts.noteTooLong", { max: String(ACCOUNT_NOTE_MAX_LENGTH) })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {t("apps.change.cancel")}
            </Button>
            <Button type="submit" disabled={saving || problem !== null}>
              {t("people.accounts.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
