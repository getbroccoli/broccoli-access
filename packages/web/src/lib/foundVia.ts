import { type MessageKey, t } from "@/i18n";

/**
 * How an app's accounts were found, as people read it, such as "Google sign-in"; a container
 * connector's finding kind reads as its app's members, such as "Linear members".
 */
export function describeFoundVia(
  findingKinds: readonly string[],
  containerConnectors: readonly { findingKind: string; name: string }[],
): string {
  return findingKinds.map((kind) => foundViaLabel(kind, containerConnectors)).join(", ");
}

/** The finding kinds the core's own connector registers, as people read them. */
const FOUND_VIA_LABELS: Record<string, MessageKey> = {
  google_directory: "apps.foundVia.google_directory",
  google_sign_in: "apps.foundVia.google_sign_in",
};

function foundViaLabel(
  findingKind: string,
  containerConnectors: readonly { findingKind: string; name: string }[],
): string {
  const label = FOUND_VIA_LABELS[findingKind];
  if (label) {
    return t(label);
  }
  const connector = containerConnectors.find((candidate) => candidate.findingKind === findingKind);
  return connector ? t("apps.foundVia.members", { app: connector.name }) : findingKind;
}
