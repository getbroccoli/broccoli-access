import type { Orm } from "../../../core/db";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import {
  createSetupSessionService,
  createInstanceService,
  type MailConfig,
  type MailSettingsService,
} from "../../../core/instance";
import { OPERATIONS, type SecurityContext } from "../../../core/security";

const setupSessions = createSetupSessionService();
const instances = createInstanceService();

const STEPS = { owner: "OWNER", done: "DONE" } as const;
const HOLDERS = { you: "YOU", another_device: "ANOTHER_DEVICE", nobody: "NOBODY" } as const;
const MAIL_SOURCES = {
  smtp_server: "SMTP_SERVER",
  resend_api: "RESEND_API",
  no_email: "NO_EMAIL",
} as const;
const MAIL_SOURCE_INPUTS = {
  SMTP_SERVER: "smtp_server",
  RESEND_API: "resend_api",
  NO_EMAIL: "no_email",
} as const;

export function createResolvers({
  orm,
  mailSettings,
}: {
  orm: Orm;
  mailSettings: Pick<MailSettingsService, "read" | "save" | "sendTestEmail">;
}): Resolvers {
  const readSetup = (security: SecurityContext | null) => readSetupView(orm, security);
  return {
    Query: {
      ping: () => "pong",
      setup: (_parent, _args, { security }) => readSetup(security),
      me: (_parent, _args, { security }) => {
        const user = security?.user;
        return user
          ? {
              id: user.userId,
              email: user.email,
              isOwner: user.isOwner,
              operations: OPERATIONS.filter((operation) => security.can(operation)),
            }
          : null;
      },
    },
    Setup: {
      mail: async (_parent, _args, context) =>
        toMailGraphql(await mailSettings.read(context.getActor())),
    },
    Mutation: {
      system: () => ({}),
    },
    SystemMutations: {
      saveMailSettings: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["SetupSaveMailSettingsPayload"]>(async () => {
          const actor = context.getActor();
          await mailSettings.save(
            actor,
            { source: MAIL_SOURCE_INPUTS[input.source], from: input.from, secret: input.secret },
            await context.publicOrigin(),
          );
          return { setup: await readSetup(actor) };
        }, ["INVALID_INPUT", "UNAVAILABLE", "CONFLICT"]),
      sendTestEmail: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["SetupSendTestEmailPayload"]>(async () => {
          const actor = context.getActor();
          await mailSettings.sendTestEmail(actor);
          return { setup: await readSetup(actor) };
        }, ["UNAVAILABLE", "CONFLICT"]),
    },
  };
}

/** The `Setup` object for `security`, as `Query.setup` and every setup payload return it. */
async function readSetupView(orm: Orm, security: SecurityContext | null) {
  const { step, mailSource } = await instances.readInstance(orm);
  return {
    id: "instance",
    step: STEPS[step],
    // A live setup cookie made the request the setup holder; any other carries no live token.
    holder: security?.isSetupHolder
      ? ("YOU" as const)
      : HOLDERS[await setupSessions.readSetupHolder(orm, { token: null, now: new Date() })],
    passwordResetByEmail: mailSource !== null && mailSource !== "no_email",
  };
}

function toMailGraphql(mail: MailConfig) {
  return { id: "mail", ...mail, source: MAIL_SOURCES[mail.source] };
}
