import assert from "node:assert/strict";

import { onTestFinished } from "vitest";

import { startFakeResend } from "./fakeResend";
import { TestEnv, TEST_OWNER } from "./testEnv";

/** A real password owner, signed in after setup, with a local mail provider. */
export async function startMailTestEnv() {
  const resend = await startFakeResend();
  onTestFinished(() => resend.stop());
  const env = await TestEnv.start({ resendApiUrl: resend.url });
  onTestFinished(() => env.stop());
  const owner = await env.startSetup();
  assert.equal((await owner.post("/api/auth/setup", TEST_OWNER)).status, 200);
  return { env, owner, resend };
}

export const SAVE_MAIL_SETTINGS = `mutation SaveMailSettings($input: MailSettingsInput!) {
  system {
    saveMailSettings(input: $input) {
      setup { id mail { id source from hasSecret } passwordResetByEmail }
      error { __typename ... on Error { message } }
    }
  }
}`;

export const RESEND_CHOICE = {
  source: "RESEND_API",
  from: "access@example.com",
  secret: "resend-key",
};
