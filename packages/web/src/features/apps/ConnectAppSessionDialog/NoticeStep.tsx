import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { t } from "@/i18n";

type Props = {
  app: string;
  /** The app's notice, as its connector words it. */
  notice: string;
  onAccept: () => void;
};

/** Step 3: the app's notice, which the owner accepts for their company before connecting. */
export function NoticeStep({ app, notice, onAccept }: Props) {
  const [isChecked, setChecked] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h3 className="text-base font-semibold">{t("settings.appSession.noticeTitle", { app })}</h3>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {notice}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {t("settings.appSession.noticeChoice", { app })}
        </p>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-foreground"
          checked={isChecked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        {t("settings.appSession.noticeAccept", { app })}
      </label>
      <DialogFooter className="m-0 flex-row justify-end gap-2 border-0 bg-transparent p-0">
        <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
          {t("settings.apps.dialog.cancel")}
        </DialogClose>
        <Button type="button" size="lg" disabled={!isChecked} onClick={onAccept}>
          {t("settings.appSession.acceptAndContinue")}
        </Button>
      </DialogFooter>
    </>
  );
}
