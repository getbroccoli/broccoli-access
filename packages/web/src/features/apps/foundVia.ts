import { type MessageKey, t } from "@/i18n";

/** How accounts were found, as people read it, such as "Google sign-in". */
export function describeFoundVia(findingKinds: readonly string[]): string {
  return findingKinds.map(foundViaLabel).join(", ");
}

/** The finding kinds the connector modules register, as people read them. */
const FOUND_VIA_LABELS: Record<string, MessageKey> = {
  google_directory: "apps.foundVia.google_directory",
  google_sign_in: "apps.foundVia.google_sign_in",
};

function foundViaLabel(findingKind: string): string {
  const label = FOUND_VIA_LABELS[findingKind];
  return label ? t(label) : findingKind;
}
