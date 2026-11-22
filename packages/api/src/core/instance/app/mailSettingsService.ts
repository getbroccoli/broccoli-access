import { randomUUID } from "node:crypto";

import { ApplicationError, invalidInput } from "../../applicationError";
import type { Orm, Transact, Tx } from "../../db";
import type { Logger } from "../../logger";
import type { SecretBox } from "../../secrets";
import type { SecurityContext } from "../../security";
import {
  createMailer,
  MailRefusedError,
  type Mailer,
  type MailTransport,
  verifySmtpServer,
} from "../../../integrations/mail";
import { instanceRepository } from "../db";
import { decideMailSettings, type MailChoice, type MailConfig } from "../domain";
import { TEST_EMAIL_TEMPLATE } from "./mailTest.email";

/** How the instance sends email: the owner's SMTP server, their Resend key, or no email. */
export interface MailSettingsService {
  /** The saved choice. */
  read: (ctx: SecurityContext) => Promise<MailConfig>;
  /** Checks the choice, then saves it with the origin its links use. */
  save: (ctx: SecurityContext, choice: MailChoice, linkOrigin: string) => Promise<MailConfig>;
  /** Development startup chooses Mailpit once and keeps its links on the current dev port. */
  configureDevelopmentMail: (ctx: SecurityContext, linkOrigin: string) => Promise<void>;
  /** Sends the caller a test email with the saved choice. */
  sendTestEmail: (ctx: SecurityContext) => Promise<void>;
  /** How this instance sends email now: the saved choice; null without email. Joins `db` when it is a transaction. */
  readMailer: (ctx: SecurityContext, db?: Orm | Tx) => Promise<InstanceMailer | null>;
}

/** A mailer and the origin its links use. */
export interface InstanceMailer {
  mailer: Mailer;
  linkOrigin: string;
}

/** The mail integration, which use-case tests replace with a fake. */
export interface MailIntegration {
  createMailer: (transport: MailTransport, origin: string) => Mailer;
  verifySmtpServer: (url: string) => Promise<void>;
}

export function createMailSettingsService({
  orm,
  transact,
  secretBox,
  publicUrl,
  logger,
  resendApiUrl,
  mail = { createMailer, verifySmtpServer },
}: {
  orm: Orm;
  transact: Transact;
  secretBox: SecretBox;
  /** `SELF_HOSTED_PUBLIC_URL`; unset takes the origin the owner saved from. */
  publicUrl?: string;
  logger: Logger;
  /** Resend's API, `https://api.resend.com` in production. */
  resendApiUrl: string;
  mail?: MailIntegration;
}): MailSettingsService {
  // `SELF_HOSTED_PUBLIC_URL` wins over the origin the owner saved from.
  const publicOrigin = publicUrl ? new URL(publicUrl).origin : null;
  const readMailer = (db: Orm | Tx = orm) =>
    readSavedMailer(db, { secretBox, mail, resendApiUrl, publicOrigin });

  return {
    read: async (ctx) => {
      ctx.require("MANAGE_WORKSPACE");
      return withoutOrigin(await instanceRepository(orm).readMailSettings());
    },

    save: async (ctx, choice, linkOrigin) => {
      ctx.require("MANAGE_WORKSPACE");
      const change = decideMailSettings(choice, await instanceRepository(orm).readMailSettings());
      if (change.source === "smtp_server" && typeof change.secret === "string") {
        await checkSmtpServer(mail, change.secret, logger);
      }
      await transact(async (tx) => {
        const repository = instanceRepository(tx);
        await repository.lockInstance();
        // Another save may have changed the source since the check; a kept secret must still be its own.
        const locked = decideMailSettings(choice, await repository.readMailSettings());
        await repository.storeMailSettings({
          source: locked.source,
          from: locked.from,
          encryptedSecret:
            locked.secret === undefined
              ? (await repository.readMailSender()).encryptedSecret
              : locked.secret === null
                ? null
                : secretBox.encrypt(locked.secret),
          linkOrigin: publicOrigin ?? linkOrigin,
        });
      });
      logger.info({ mailSource: change.source }, "Mail choice saved");
      return withoutOrigin(await instanceRepository(orm).readMailSettings());
    },

    configureDevelopmentMail: async (ctx, linkOrigin) => {
      ctx.requireSystem();
      if ((await instanceRepository(orm).readInstance()).mailSource === null) {
        await checkSmtpServer(mail, MAILPIT_URL, logger);
      }
      await transact(async (tx) => {
        const repository = instanceRepository(tx);
        const instance = await repository.lockInstance();
        if (instance.mailSource === null) {
          await repository.storeMailSettings({
            source: "smtp_server",
            from: "access@example.com",
            encryptedSecret: secretBox.encrypt(MAILPIT_URL),
            linkOrigin,
          });
        } else if (instance.mailSource === "smtp_server") {
          const saved = await repository.readMailSender();
          if (saved.encryptedSecret && secretBox.decrypt(saved.encryptedSecret) === MAILPIT_URL) {
            await repository.storeMailSettings({ ...saved, linkOrigin });
          }
        }
      });
    },

    sendTestEmail: async (ctx) => {
      ctx.require("MANAGE_WORKSPACE");
      const caller = ctx.user;
      const saved = caller === null ? null : await readMailer();
      if (caller === null || saved === null) {
        throw new ApplicationError("CONFLICT", "Choose how Broccoli Access sends email first.");
      }
      try {
        await saved.mailer.send({
          template: TEST_EMAIL_TEMPLATE,
          values: { recipient: caller.email },
          to: caller.email,
          fromName: "Broccoli Access",
          idempotencyKey: randomUUID(),
        });
        logger.info({ userId: caller.userId }, "Test email sent");
      } catch (error) {
        throw testEmailRefusal(error, logger);
      }
    },

    readMailer: async (ctx, db = orm) => {
      ctx.require("MANAGE_WORKSPACE");
      return readMailer(db);
    },
  };
}

const MAILPIT_URL = "smtp://mailpit:1025";

/** The saved choice's mailer and link origin, from one read so the secret matches its source. */
async function readSavedMailer(
  db: Orm | Tx,
  {
    secretBox,
    mail,
    resendApiUrl,
    publicOrigin,
  }: {
    secretBox: SecretBox;
    mail: MailIntegration;
    resendApiUrl: string;
    publicOrigin: string | null;
  },
): Promise<InstanceMailer | null> {
  const { source, from, encryptedSecret, linkOrigin } =
    await instanceRepository(db).readMailSender();
  if (source === "no_email" || from === null || encryptedSecret === null) {
    return null;
  }
  const secret = secretBox.decrypt(encryptedSecret);
  const transport: MailTransport =
    source === "smtp_server"
      ? { kind: source, url: secret, from }
      : { kind: source, apiUrl: resendApiUrl, key: secret, from };
  // A choice is always saved with an origin; the fallback only satisfies the type.
  const origin = publicOrigin ?? linkOrigin ?? "";
  return { mailer: mail.createMailer(transport, origin), linkOrigin: origin };
}

/** Longest provider reason shown to the owner. */
const MAX_REASON_LENGTH = 300;

function withoutOrigin({ source, from, hasSecret }: MailConfig): MailConfig {
  return { source, from, hasSecret };
}

async function checkSmtpServer(mail: MailIntegration, url: string, logger: Logger): Promise<void> {
  try {
    await mail.verifySmtpServer(url);
  } catch (error) {
    if (!(error instanceof MailRefusedError)) {
      throw error;
    }
    logger.warn({ kind: error.message, retryable: error.retryable }, "SMTP server check refused");
    throw error.retryable
      ? new ApplicationError("UNAVAILABLE", "The mail server could not be reached. Try again.")
      : invalidInput([{ field: "secret", code: "rejected" }]);
  }
}

function testEmailRefusal(error: unknown, logger: Logger): unknown {
  if (!(error instanceof MailRefusedError)) {
    return error;
  }
  logger.warn({ kind: error.message, retryable: error.retryable }, "Test email refused");
  const reason = (error.providerReason ?? error.message).slice(0, MAX_REASON_LENGTH);
  // The provider's reason is the message, for the owner who chose the provider.
  return new ApplicationError("UNAVAILABLE", reason);
}
