import { test as base } from "vitest";

import { startFakeConnectors } from "../../src/connectors";
import { startFakeGoogle } from "../../src/google";

export const REDIRECT_URI = "http://localhost:3000/oauth/google/callback";
export const DAY = 86_400_000;
export const SCOPES = {
  customer: "https://www.googleapis.com/auth/admin.directory.customer.readonly",
  users: "https://www.googleapis.com/auth/admin.directory.user.readonly",
  tokens: "https://www.googleapis.com/auth/admin.directory.user.security",
  reports: "https://www.googleapis.com/auth/admin.reports.audit.readonly",
};
export const ADMIN_SCOPES = ["openid", "email", "profile", ...Object.values(SCOPES)].join(" ");
export const CUSTOMER_PATH = "/admin/directory/v1/customers/my_customer";
export const USERS_PATH = "/admin/directory/v1/users?customer=my_customer";
export const REPORTS_PATH =
  "/admin/reports/v1/activity/users/all/applications/token?eventName=authorize";

export interface TestFakeGoogle {
  url: string;
  startedAt: Date;
  now: Date;
  setPhoto: (email: string, photo: Buffer | null) => void;
}

export const test = base.extend<{ fake: TestFakeGoogle; connectors: { url: string } }>({
  // eslint-disable-next-line no-empty-pattern -- Vitest requires destructured fixture dependencies.
  connectors: async ({}, use) => {
    const server = await startFakeConnectors({ delayMs: 0 });
    try {
      await use({ url: server.url });
    } finally {
      await server.stop();
    }
  },
  // eslint-disable-next-line no-empty-pattern -- Vitest requires destructured fixture dependencies.
  fake: async ({}, use) => {
    const startedAt = new Date("2026-11-21T08:00:00.000Z");
    const fake: TestFakeGoogle = {
      url: "",
      startedAt,
      now: new Date(startedAt),
      setPhoto: (email, photo) => server.setPhoto(email, photo),
    };
    const server = await startFakeGoogle({
      redirectUris: [REDIRECT_URI],
      now: () => new Date(fake.now),
    });
    fake.url = server.url;
    try {
      await use(fake);
    } finally {
      await server.stop();
    }
  },
});
