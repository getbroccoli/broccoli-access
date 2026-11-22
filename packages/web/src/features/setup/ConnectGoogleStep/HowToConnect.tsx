import { OptionCard } from "@/components/form";
import { t } from "@/i18n";

/** The two ways to connect: Broccoli's own Google app, coming later, and the admin's own one. */
export function HowToConnect() {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-[15px] font-medium">{t("setup.connect.howToConnect")}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionCard
          name="google-app"
          value="broccoli_google_app"
          selected="own_google_app"
          onSelect={ignoreSelection}
          disabled
          title={
            <span className="flex flex-wrap items-center gap-2">
              {t("setup.connect.broccoliApp")}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {t("setup.connect.comingSoon")}
              </span>
            </span>
          }
          hint={t("setup.connect.broccoliAppHint")}
        />
        <OptionCard
          name="google-app"
          value="own_google_app"
          selected="own_google_app"
          onSelect={ignoreSelection}
          title={t("setup.connect.ownApp")}
          hint={t("setup.connect.ownAppHint")}
        />
      </div>
    </fieldset>
  );
}

/** The admin's own Google app is the only choice until Broccoli's app arrives. */
function ignoreSelection(): void {}
