import { appEn } from "./en/app";
import { appsEn } from "./en/apps";
import { appsIntegrationUserEn } from "./en/appsIntegrationUser";
import { appsRemoveEn } from "./en/appsRemove";
import { authEn } from "./en/auth";
import { navEn } from "./en/nav";
import { notFoundEn } from "./en/notFound";
import { peopleEn } from "./en/people";
import { scansEn } from "./en/scans";
import { settingsEn } from "./en/settings";
import { setupEn } from "./en/setup";
import { templatesEn } from "./en/templates";

/** English copy, one file per key prefix under `en/`. Every user-facing string is read through `t()`. */
export const en = {
  ...appEn,
  ...appsEn,
  ...appsIntegrationUserEn,
  ...appsRemoveEn,
  ...authEn,
  ...setupEn,
  ...navEn,
  ...peopleEn,
  ...scansEn,
  ...notFoundEn,
  ...settingsEn,
  ...templatesEn,
} as const;
