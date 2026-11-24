import { toast } from "sonner";

import { AddTemplateAppDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { AppMark } from "@/components/AppMark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

type Props = {
  templateId: string;
  /** The company's approved apps that are not in the template yet. */
  apps: readonly { id: string; name: string; catalogKey?: string | null }[];
};

/** "Add app": a menu of the approved apps the template lacks; choosing one adds it. */
export function AddAppMenu({ templateId, apps }: Props) {
  // The payload carries the template's apps, so the table shows the new one.
  const [addApp, { loading }] = usePayloadMutation(AddTemplateAppDocument);
  const add = (app: { id: string; name: string }) =>
    addApp({ variables: { input: { id: templateId, appId: app.id } } }).catch(() =>
      toast.error(t("templates.addAppFailed", { app: app.name })),
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" className="px-3" disabled={loading} />}
      >
        {t("templates.addApp")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
        {apps.length === 0 && (
          <DropdownMenuItem disabled>{t("templates.addApp.none")}</DropdownMenuItem>
        )}
        {apps.map((app) => (
          <DropdownMenuItem key={app.id} onClick={() => void add(app)}>
            <AppMark name={app.name} catalogKey={app.catalogKey ?? null} className="size-5" />
            {app.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
