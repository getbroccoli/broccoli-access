import { type FormEvent, type ReactElement, useId, useState } from "react";

import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

type Props = {
  /** The button that opens it. */
  trigger: ReactElement;
  title: string;
  submitLabel: string;
  /** The name the field starts with: the template's, or none for a new one. */
  initialName: string;
  saving: boolean;
  /** Why the last save was refused, shown under the field. */
  error: string | undefined;
  /** Saves the name; the dialog closes once it resolves and stays open when it rejects. */
  onSave: (name: string) => Promise<unknown>;
  /** Clears the last save's error, when the dialog opens or closes. */
  onReset: () => void;
};

/** A dialog asking for a template's name, for a new template and for Rename. */
export function TemplateNameDialog({
  trigger,
  title,
  submitLabel,
  initialName,
  saving,
  error,
  onSave,
  onReset,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const id = useId();
  const changeOpen = (next: boolean) => {
    // Closed only once the save ends, so its answer never lands in a closed dialog.
    if (saving) {
      return;
    }
    setOpen(next);
    setName(initialName);
    onReset();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The caller's mutation keeps a failure for display, so the rejection needs no handling here.
    onSave(name).then(
      () => setOpen(false),
      () => undefined,
    );
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={false} className="gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
        </DialogHeader>
        <form id={`${id}-form`} onSubmit={submit} className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{t("templates.name.label")}</Label>
          <Input
            id={id}
            autoComplete="off"
            autoFocus
            className="h-10 rounded-lg"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={error !== undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <FieldError id={`${id}-error`} message={error} />
        </form>
        <DialogFooter className="m-0 flex-row justify-end gap-2 border-0 bg-transparent p-0">
          <DialogClose
            render={<Button type="button" variant="outline" size="lg" disabled={saving} />}
          >
            {t("templates.cancel")}
          </DialogClose>
          <Button type="submit" form={`${id}-form`} size="lg" className="px-4" disabled={saving}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
