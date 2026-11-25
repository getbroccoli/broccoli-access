import { t } from "@/i18n";
import type { GoogleUserWritesOutcome } from "@/lib/useGoogleUserWrites";

type Props = {
  /** How Google's consent ended, from the page's `googleUserWrites` search param. */
  outcome: GoogleUserWritesOutcome;
};

/**
 * Back from Google's consent for changing users, started from a Disable or Enable: what Google
 * answered, and that no account changed yet, so the owner asks for the change again.
 */
export function GoogleUserWritesNotice({ outcome }: Props) {
  return (
    <p
      role="status"
      className="rounded-xl border border-border bg-muted px-5 py-4 text-sm text-foreground/80"
    >
      {t(OUTCOMES[outcome])}
    </p>
  );
}

const OUTCOMES = {
  allowed: "apps.googleWrites.allowed",
  cancelled: "apps.googleWrites.cancelled",
  permission_refused: "apps.googleWrites.refused",
  not_super_admin: "apps.googleWrites.notSuperAdmin",
  other_workspace: "apps.googleWrites.otherWorkspace",
  failed: "apps.googleWrites.failed",
} as const;
