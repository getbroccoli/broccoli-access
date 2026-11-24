import { RenameTemplateDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { TemplateNameDialog } from "../TemplateNameDialog";
import { templateNameError } from "../templateNameError";

type Props = {
  template: { id: string; name: string };
};

/** Rename: asks for the template's new name; the payload brings it to every page that shows it. */
export function RenameTemplateButton({ template }: Props) {
  const [rename, { loading, error, payloadError, reset }] =
    usePayloadMutation(RenameTemplateDocument);

  return (
    <TemplateNameDialog
      trigger={
        <Button type="button" variant="outline" size="lg" className="px-3.5">
          {t("templates.rename")}
        </Button>
      }
      title={t("templates.renameTitle", { name: template.name })}
      submitLabel={t("templates.save")}
      initialName={template.name}
      saving={loading}
      error={templateNameError(payloadError, error !== undefined)}
      onSave={(name) => rename({ variables: { input: { id: template.id, name } } })}
      onReset={reset}
    />
  );
}
