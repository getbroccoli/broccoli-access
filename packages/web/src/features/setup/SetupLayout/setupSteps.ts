import { redirect } from "@tanstack/react-router";

import type { SetupStep } from "@/__generated__/graphql";
import type { MessageKey } from "@/i18n";

/** The path of a setup page, or home once setup is done. */
export type SetupPath = "/setup" | "/setup/scan" | "/apps" | "/";

interface StepDefinition {
  id: string;
  title: MessageKey;
  path: SetupPath;
  /** The server's setup step the page belongs to. */
  step: SetupStep;
}

/** Setup's steps in order. */
const STEPS = [
  { id: "connect_google", title: "setup.connect.title", path: "/setup", step: "CONNECT_GOOGLE" },
  { id: "scan", title: "setup.scan.title", path: "/setup/scan", step: "SCAN" },
  // The app's own Applications page, in its first-run mode.
  { id: "select_apps", title: "setup.selectApps.title", path: "/apps", step: "SELECT_APPS" },
] as const satisfies readonly StepDefinition[];

/** Where setup ends: home, which is Applications. */
const FINISHED: SetupPath = "/";

/** A setup page. */
export type SetupStepId = (typeof STEPS)[number]["id"];

export type StepState = "done" | "current" | "later";

export interface StepView {
  id: string;
  /** Counted from 1. */
  number: number;
  title: MessageKey;
  state: StepState;
}

/** Each step with its state, seen from the current page. */
export function stepViews(current: SetupStepId): StepView[] {
  const currentIndex = STEPS.findIndex(({ id }) => id === current);
  return STEPS.map(({ id, title }, index) => ({
    id,
    number: index + 1,
    title,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "later",
  }));
}

/** The page of a server step, or home once setup is done. */
export function setupStepPage(step: SetupStep): SetupPath {
  if (step === "DONE") {
    return FINISHED;
  }
  const page = STEPS.find((candidate) => candidate.step === step);
  if (!page) {
    throw new Error(`Setup has no page for the ${step} step`);
  }
  return page.path;
}

/**
 * The gate of a setup page: sends a visitor who is neither signed in nor holding setup to
 * login, and anyone else to the page of the current step unless `page` belongs to it.
 */
export function requireSetupPage<Me>(page: SetupStepId, { context, location }: Gate<Me>): void {
  if (!context.me && !context.holdsSetup) {
    throw loginRedirect(location.href);
  }
  const definition = STEPS.find(({ id }) => id === page);
  if (!definition || definition.step !== context.setupStep) {
    throw redirect({ to: setupStepPage(context.setupStep), replace: true });
  }
}

/**
 * The gate of the app itself: a signed-in user once setup is done, or on the app page of the
 * current setup step, such as Applications while they select the apps. Returns them.
 */
export function requireFinishedSetup<Me>({ context, location }: Gate<Me>): Me {
  if (!context.me && !context.holdsSetup) {
    throw loginRedirect(location.href);
  }
  const stepPage = setupStepPage(context.setupStep);
  const recoveringGoogle =
    context.me &&
    context.setupStep === "SCAN" &&
    location.pathname === "/settings/connections/google-app";
  if (context.setupStep !== "DONE" && location.pathname !== stepPage && !recoveringGoogle) {
    throw redirect({ to: stepPage, replace: true });
  }
  // Setup ends by signing the new owner in, so only a signed-in user gets here.
  if (!context.me) {
    throw loginRedirect(location.href);
  }
  return context.me;
}

interface Gate<Me> {
  context: { me: Me | null; holdsSetup: boolean; setupStep: SetupStep };
  location: { href: string; pathname: string };
}

function loginRedirect(href: string) {
  return redirect({ to: "/login", search: { redirect: href }, replace: true });
}
