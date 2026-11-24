import type { GoogleApp } from "@/__generated__/graphql";
import { OptionCard } from "@/components/form";
import { t } from "@/i18n";

type Props = {
  selected: GoogleApp;
  onSelect: (app: GoogleApp) => void;
  available: boolean;
  disabled: boolean;
};

/** The available ways to connect this instance to Google Workspace. */
export function HowToConnect({ selected, onSelect, available, disabled }: Props) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-[15px] font-medium">{t("setup.connect.howToConnect")}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionCard
          name="google-app"
          value="BROCCOLI_GOOGLE_APP"
          selected={selected}
          onSelect={onSelect}
          disabled={!available || disabled}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {t("setup.connect.broccoliApp")}
              {!available && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {t("setup.connect.comingSoon")}
                </span>
              )}
            </span>
          }
          hint={t("setup.connect.broccoliAppHint")}
        />
        <OptionCard
          name="google-app"
          value="OWN_GOOGLE_APP"
          selected={selected}
          onSelect={onSelect}
          disabled={disabled}
          title={t("setup.connect.ownApp")}
          hint={t("setup.connect.ownAppHint")}
        />
      </div>
    </fieldset>
  );
}
