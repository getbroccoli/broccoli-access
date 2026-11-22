import { GoogleLogo } from "@phosphor-icons/react";

import { buttonVariants } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";

import type { SignInError } from "./loginSearch";

/** Starts the sign-in on the API, which sends the browser on to Google. */
const SIGN_IN_PATH = "/api/google/sign-in";

const SIGN_IN_ERROR_MESSAGES: Record<SignInError, MessageKey> = {
  cancelled: "auth.signIn.cancelled",
  not_allowed: "auth.signIn.notAllowed",
  failed: "auth.signIn.failed",
};

type Props = {
  /** Why the last sign-in failed, from Google's redirect back. */
  signInError: SignInError | undefined;
};

/** The sign-in page's one way in: Sign in with Google, and why the last try failed. */
export function GoogleSignIn({ signInError }: Props) {
  return (
    <>
      <a
        href={SIGN_IN_PATH}
        className={buttonVariants({
          variant: "outline",
          className: "h-12 w-full gap-2.5 text-base",
        })}
      >
        <GoogleLogo weight="fill" className="size-5" aria-hidden />
        {t("auth.signIn.withGoogle")}
      </a>
      {signInError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {t(SIGN_IN_ERROR_MESSAGES[signInError])}
        </p>
      )}
    </>
  );
}
