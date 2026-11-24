import { useNavigate } from "@tanstack/react-router";

import { CreateTemplateDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { TemplateNameDialog } from "../TemplateNameDialog";
import { templateNameError } from "../templateNameError";

/** "New template": asks for its name, creates it and opens its page, where its apps are added. */
export function NewTemplateButton() {
  const navigate = useNavigate();
  const [create, { loading, error, payloadError, reset }] =
    usePayloadMutation(CreateTemplateDocument);
  const save = async (name: string) => {
    const { template } = await create({ variables: { input: { name } } });
    if (template) {
      await navigate({ to: "/templates/$templateId", params: { templateId: template.id } });
    }
  };

  return (
    <TemplateNameDialog
      trigger={
        <Button type="button" size="lg" className="px-4">
          {t("templates.new")}
        </Button>
      }
      title={t("templates.new")}
      submitLabel={t("templates.create")}
      initialName=""
      saving={loading}
      error={templateNameError(payloadError, error !== undefined)}
      onSave={save}
      onReset={reset}
    />
  );
}
