import { z } from "zod";

import { invalidInput } from "../../../core/applicationError";

const CONNECTION_START = z.object({
  googleApp: z.enum(["own_google_app", "broccoli_google_app"]).default("own_google_app"),
  clientId: z.string().catch(""),
  clientSecret: z.string().catch(""),
});

/** Google's redirect: a code, or an error such as `access_denied` when the person cancels. */
const CONSENT_ANSWER = z.object({
  code: z.string().optional(),
  handle: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export type ConsentAnswer = z.infer<typeof CONSENT_ANSWER>;

export function parseStart(body: unknown) {
  const result = CONNECTION_START.safeParse(body ?? {});
  if (!result.success) throw invalidInput([{ field: "googleApp", code: "invalid" }]);
  return result.data;
}

export function hasConsentAnswer(
  answer: ConsentAnswer,
): answer is ConsentAnswer & { state: string } {
  return (
    (answer.code !== undefined || answer.handle !== undefined) &&
    answer.state !== undefined &&
    answer.error === undefined
  );
}

/** Refuses malformed fields while retaining the flow needed to send the browser back. */
export function parseAnswer(query: Record<string, unknown>): ConsentAnswer {
  const parsed = CONSENT_ANSWER.safeParse(query);
  return parsed.success
    ? parsed.data
    : {
        state: typeof query.state === "string" ? query.state : undefined,
        error: "invalid_request",
      };
}
