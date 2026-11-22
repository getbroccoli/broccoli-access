import { startFakeGoogle } from "@broccoli-access/fake-apps";

import { onTestFinished } from "vitest";

import { startFakeResend } from "./fakeResend";
import { TestEnv } from "./testEnv";

/** A real Google owner, signed in after setup, with a local mail provider. */
export async function startMailTestEnv() {
  const resend = await startFakeResend();
  onTestFinished(() => resend.stop());
  const google = await startFakeGoogle();
  onTestFinished(() => google.stop());
  const env = await TestEnv.start({ resendApiUrl: resend.url, googleUrl: google.url });
  onTestFinished(() => env.stop());
  const { browser: owner } = await env.signInAsOwner();
  return { env, owner, resend };
}

export const SAVE_MAIL_SETTINGS = `mutation SaveMailSettings($input: MailSettingsInput!) {
  system {
    saveMailSettings(input: $input) {
      setup { id mail { id source from hasSecret } }
      error { __typename ... on Error { message } }
    }
  }
}`;

export const RESEND_CHOICE = {
  source: "RESEND_API",
  from: "access@example.com",
  secret: "resend-key",
};
