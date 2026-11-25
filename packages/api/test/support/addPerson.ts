import { assert } from "vitest";

import { createGoogleClient } from "../../src/integrations/google";
import type { SecurityContext } from "../../src/core/security";
import type { Orm } from "../../src/core/db";
import { createAddPersonService } from "../../src/modules/apps";
import { accountChangeDependencies } from "./accountChanges";
import { consentAnswer, CREATION_START } from "./integrationUserTest";
import { connectionSecrets, storedAppConnections } from "./storedGoogleConnection";
import { refreshGoogleGrant } from "./googleConsent";
import { inviteTest } from "./inviteTest";
import { employeeServices, templates, userWriteConsent } from "./services";
import { SYSTEM } from "./testSecurityContext";

/** Add person with the employee and template services sharing its transaction. */
export function addPersonService(orm: Orm) {
  const { directoryConnectors, findPeopleAwaitingDirectory, logger, transact } =
    accountChangeDependencies(orm, {});
  return createAddPersonService({
    orm,
    transact,
    logger,
    directoryConnectors,
    employees: { ...employeeServices(orm), findPeopleAwaitingDirectory },
    templates: templates(orm),
  });
}

export const NEW_PERSON = { firstName: "Robin", lastName: "Reed", email: "robin@acme.example" };

export const directoryProvisionTest = inviteTest.extend<{
  provisionPerson: (options?: {
    email?: string;
    templateIds?: string[];
    appIds?: string[];
  }) => Promise<{ employeeId: string; changeId: string; run: () => Promise<void> }>;
}>({
  provisionPerson: async ({ workspace: { owner, provision, sent }, orm, fakeGoogle }, use) => {
    await allowDirectoryWrites(orm, fakeGoogle.url, owner);
    await use(async ({ email = NEW_PERSON.email, templateIds = [], appIds = [] } = {}) => {
      const { id: employeeId } = await addPersonService(orm).addPerson(owner, {
        ...NEW_PERSON,
        email,
        templateIds,
      });
      const changes = await provision.provisionEmployee(owner, { employeeId, appIds });
      const changeId = changes[0]?.id;
      assert(changeId, "Provision must return the directory change");
      const queued = sent.find(
        ({ name, payload }) =>
          name === "apps.runDirectoryProvision" &&
          "changeId" in payload &&
          payload.changeId === changeId,
      )?.payload;
      assert(
        queued && "appIds" in queued && "changeId" in queued,
        "The directory job must be queued",
      );
      return {
        employeeId,
        changeId,
        run: () =>
          provision.runDirectoryProvision(SYSTEM, {
            changeId: queued.changeId,
            appIds: queued.appIds,
          }),
      };
    });
  },
});

/**
 * Creates the account independently of Provision, as a Google administrator would, or, with the
 * person's `creationKey`, as an earlier try of Provision whose answer was lost.
 */
export async function createPersonAtGoogle(
  orm: Orm,
  googleUrl: string,
  owner: SecurityContext,
  { email, firstName, lastName }: typeof NEW_PERSON,
  created: { creationKey?: string; changePasswordAtNextLogin?: boolean; suspended?: boolean } = {},
) {
  await allowDirectoryWrites(orm, googleUrl, owner);
  const row = (await storedAppConnections(orm)).find(
    ({ connector }) => connector === "google_workspace",
  );
  assert(row);
  const token = await refreshGoogleGrant(googleUrl, connectionSecrets(row));
  const google = createGoogleClient({
    openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
    adminApiUrl: googleUrl,
  });
  const user = await google.createUser(token.access_token, {
    email,
    givenName: firstName,
    familyName: lastName,
    password: "external-test-password",
    creationKey: created.creationKey,
    changePasswordAtNextLogin: created.changePasswordAtNextLogin,
  });
  if (created.suspended) await google.setUserSuspended(token.access_token, user.id, true);
}

async function allowDirectoryWrites(orm: Orm, googleUrl: string, owner: SecurityContext) {
  const grant = userWriteConsent(orm, { googleUrl });
  const start = await grant.start(owner, { ...CREATION_START, returnTo: "/people" });
  await grant.finish(owner, await consentAnswer(start));
}
