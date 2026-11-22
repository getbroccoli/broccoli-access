import { useNavigate, useRouter } from "@tanstack/react-router";

import { FinishSetupDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useRouteAction } from "@/lib/useRouteAction";

import { forgetAppLists } from "./cache";

type Props = {
  /** How many apps the scan found and await the owner's choice. */
  discoveredCount: number;
  selectedIds: ReadonlySet<string>;
};

/** Setup's last step above the app list: approve the selected apps, ignore the rest, and finish. */
export function FirstRunBanner({ discoveredCount, selectedIds }: Props) {
  const router = useRouter();
  const navigate = useNavigate();
  const [finishSetup, { error, payloadError }] = usePayloadMutation(FinishSetupDocument, {
    update: forgetAppLists,
  });
  const [run, pending] = useRouteAction();
  const finish = () =>
    run(
      () => finishSetup({ variables: { input: { approvedAppIds: [...selectedIds] } } }),
      // The route reloads with setup done, then opens the approved apps.
      async () => {
        await router.invalidate();
        await navigate({ to: "/apps", search: { status: "approved" } });
      },
    );

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-xl bg-brand-soft p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1 text-brand-deep">
        <h2 className="font-semibold">{t("apps.firstRun.title")}</h2>
        <p className="text-sm">
          {t("apps.firstRun.description", { count: String(discoveredCount) })}
        </p>
        {(error || payloadError) && (
          <p role="alert" className="text-sm text-destructive">
            {t("apps.firstRun.finishFailed")}
          </p>
        )}
      </div>
      <Button type="button" size="lg" disabled={pending} onClick={finish} className="shrink-0">
        {t("apps.firstRun.finish", { count: String(selectedIds.size) })}
      </Button>
    </section>
  );
}
