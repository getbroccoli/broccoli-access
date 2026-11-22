import { appEn } from "./en/app";
import { authEn } from "./en/auth";
import { navEn } from "./en/nav";
import { notFoundEn } from "./en/notFound";
import { peopleEn } from "./en/people";
import { recordsEn } from "./en/records";
import { settingsEn } from "./en/settings";
import { setupEn } from "./en/setup";
import { tableEn } from "./en/table";
import { todayEn } from "./en/today";

/** English copy, one file per key prefix under `en/`. Every user-facing string is read through `t()`. */
export const en = {
  ...appEn,
  ...authEn,
  ...setupEn,
  ...navEn,
  ...peopleEn,
  ...recordsEn,
  ...tableEn,
  ...notFoundEn,
  ...settingsEn,
  ...todayEn,
} as const;
