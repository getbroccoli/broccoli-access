import type { ReactNode } from "react";

import { t, type MessageKey } from "@/i18n";

/** What the admin does in Google Cloud to make their own Google app. */
export function GoogleCloudSteps() {
  const linkedSteps = [
    {
      href: "https://console.cloud.google.com/projectcreate",
      link: t("setup.connect.createProject"),
      rest: t("setup.connect.createProjectRest"),
    },
    {
      href: "https://console.cloud.google.com/apis/library/admin.googleapis.com",
      link: t("setup.connect.adminSdk"),
      rest: t("setup.connect.adminSdkRest"),
    },
    {
      href: "https://console.cloud.google.com/apis/credentials/consent",
      link: t("setup.connect.consentScreen"),
      rest: withStrong("setup.connect.consentScreenRest", "setup.connect.internal"),
    },
    {
      href: "https://console.cloud.google.com/apis/credentials/oauthclient",
      link: t("setup.connect.oauthClient"),
      rest: withStrong("setup.connect.oauthClientRest", "setup.connect.webApplication"),
    },
  ];
  return (
    <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-[15px]">
      {linkedSteps.map(({ href, link, rest }) => (
        <li key={href}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-brand-deep underline underline-offset-2 hover:text-brand"
          >
            {link}
            <span className="sr-only"> {t("setup.connect.opensInNewTab")}</span>
          </a>{" "}
          {rest}
        </li>
      ))}
      <li>{t("setup.connect.paste")}</li>
    </ol>
  );
}

/** The text of `key` with its `{strong}` placeholder shown as the bold text of `strongKey`. */
function withStrong(key: MessageKey, strongKey: MessageKey): ReactNode {
  const [before, after] = t(key).split("{strong}");
  return (
    <>
      {before}
      <strong className="font-semibold">{t(strongKey)}</strong>
      {after}
    </>
  );
}
