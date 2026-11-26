import { AppMark } from "@/components/AppMark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

type App = { id: string; name: string; catalogKey?: string | null };

type Props = {
  /** The company's approved apps that are not in the template yet, other than the directory's. */
  apps: readonly App[];
  /** While another change of the template's apps runs. */
  disabled: boolean;
  onAdd: (app: App) => void;
};

/** "Add app": a menu of the approved apps the template lacks; choosing one adds it. */
export function AddAppMenu({ apps, disabled, onAdd }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" className="px-3" disabled={disabled} />}
      >
        {t("templates.addApp")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
        {apps.length === 0 && (
          <DropdownMenuItem disabled>{t("templates.addApp.none")}</DropdownMenuItem>
        )}
        {apps.map((app) => (
          <DropdownMenuItem key={app.id} onClick={() => onAdd(app)}>
            <AppMark name={app.name} catalogKey={app.catalogKey ?? null} className="size-5" />
            {app.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
