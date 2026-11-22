import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { exportJWK, generateKeyPair } from "jose";

import { ACME } from "../seed";
import type { FakeGoogleContext, SigningKey } from "./context";
import { controlRoutes } from "./controls";
import { directoryRoutes } from "./directory";
import { grantEventRoutes } from "./grantEvents";
import { signInRoutes } from "./signIn";
import { findPerson, seededState } from "./state";

export interface FakeGoogleOptions {
  /** Redirect addresses registered for the seed's OAuth client. */
  redirectUris?: string[];
  /** Interface to listen on; defaults to `127.0.0.1`, so only this machine reaches the controls. */
  host?: string;
  /** Defaults to a free port. */
  port?: number;
  /** Address browsers use for the consent page; defaults to `url`. */
  browserUrl?: string;
  /** Address servers use for the token endpoint, user info and keys; defaults to `url`. */
  serverUrl?: string;
  /** The largest page a list returns, so tests page through a small seed; unset for Google's own bounds. */
  maxPageSize?: number;
  /** The clock; its value at start is the fake's start, which the seed's grant dates count back from. */
  now?: () => Date;
}

export interface RunningFakeGoogle {
  /** The address it listens on, such as `http://127.0.0.1:<free port>`. */
  url: string;
  stop: () => Promise<void>;
  /** Gives the person a new photo, or removes theirs with null; tests only, with no control endpoint. */
  setPhoto: (email: string, photo: Buffer | null) => void;
}

/** Starts a fake Google serving the seeded Acme, by default on a free local port. */
export async function startFakeGoogle(options: FakeGoogleOptions = {}): Promise<RunningFakeGoogle> {
  const now = options.now ?? (() => new Date());
  const start = now();
  const redirectUris = options.redirectUris ?? [];
  const host = options.host ?? "127.0.0.1";
  const signingKey = await createSigningKey();
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, resolve);
  });
  const url = `http://${host}:${(server.address() as AddressInfo).port}`;
  const context: FakeGoogleContext = {
    state: seededState(ACME, start, redirectUris),
    now,
    browserUrl: options.browserUrl ?? url,
    serverUrl: options.serverUrl ?? url,
    signingKey,
    maxPageSize: options.maxPageSize,
    reset: () => {
      context.state = seededState(ACME, start, redirectUris);
    },
  };
  server.on("request", fakeGoogleApp(context));
  return {
    url,
    setPhoto: (email, photo) => {
      const person = findPerson(context.state, email);
      if (person === undefined) throw new Error("No person has this email");
      person.photo = photo;
    },
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

function fakeGoogleApp(context: FakeGoogleContext): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(signInRoutes(context));
  app.use(directoryRoutes(context));
  app.use(grantEventRoutes(context));
  app.use(controlRoutes(context));
  return app;
}

/** One key per run, so a restart invalidates every ID token the fake signed before. */
async function createSigningKey(): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  return { kid: SIGNING_KEY_ID, privateKey, publicJwk: await exportJWK(publicKey) };
}

/** The fake publishes a single key, so its id only has to match the JWT header. */
const SIGNING_KEY_ID = "fake-google-1";
