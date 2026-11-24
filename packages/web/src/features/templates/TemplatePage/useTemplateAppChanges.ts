import { toast } from "sonner";

import {
  AddTemplateAppDocument,
  SetTemplateAppRoleDocument,
  TakeOutTemplateAppDocument,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

type App = { id: string; name: string };

/**
 * "Add app" and "Take out" on one template, one at a time: each payload carries all the template's
 * apps, so an answer arriving after a later change's would put back what that change replaced.
 */
export function useTemplateAppChanges(templateId: string) {
  const [addApp, adding] = usePayloadMutation(AddTemplateAppDocument);
  const [takeOutApp, takingOut] = usePayloadMutation(TakeOutTemplateAppDocument);
  const [setRole, settingRole] = usePayloadMutation(SetTemplateAppRoleDocument);
  const input = (app: App) => ({ variables: { input: { id: templateId, appId: app.id } } });
  return {
    changing: adding.loading || takingOut.loading || settingRole.loading,
    setRole: async (app: App, role: string | null) => {
      try {
        await setRole({ variables: { input: { id: templateId, appId: app.id, role } } });
      } catch {
        toast.error(t("templates.role.failed", { app: app.name }));
      }
    },
    /** Adds the app; a failure shows as a toast. */
    add: (app: App) =>
      addApp(input(app)).then(
        () => undefined,
        (error: unknown) =>
          void toast.error(
            // Refused input: the app stopped being approved after the menu was read.
            t(isRefusedInput(error) ? "templates.addAppUnavailable" : "templates.addAppFailed", {
              app: app.name,
            }),
          ),
      ),
    /** Takes the app out and resolves to whether it left; a failure shows as a toast. */
    takeOut: (app: App) =>
      takeOutApp(input(app)).then(
        () => true,
        () => {
          toast.error(t("templates.takeOutFailed", { app: app.name }));
          return false;
        },
      ),
  };
}

function isRefusedInput(error: unknown): boolean {
  return (
    error instanceof PayloadFailure &&
    (error.payloadError as { __typename?: string }).__typename === "InvalidInputError"
  );
}
