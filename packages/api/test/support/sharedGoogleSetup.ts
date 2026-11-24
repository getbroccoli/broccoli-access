import type { Orm } from "../../src/core/db";
import { googleSetup } from "./googleSetup";
import {
  GOOGLE_RELAY_URL,
  SHARED_GOOGLE_APP,
  RELAY_HANDLE,
  googleRelayGrant,
  stubGoogleRelay,
} from "./googleRelay";
import { SETUP_HOLDER } from "./testSecurityContext";
import { recordingJobQueue } from "./recordingJobQueue";

export async function startSharedGoogleSetup(orm: Orm, googleUrl: string) {
  const { jobs, sent } = recordingJobQueue();
  const {
    connection,
    input: { publicOrigin, setupToken, now },
  } = await googleSetup(orm, googleUrl, { relayUrl: GOOGLE_RELAY_URL, jobs });
  const input = { ...SHARED_GOOGLE_APP, publicOrigin, setupToken, now };
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const authorization = new URL(authorizationUrl);
  return {
    connection,
    input,
    authorization,
    state: authorization.searchParams.get("state")!,
    sent,
  };
}

export async function finishSharedGoogleSetup(orm: Orm, googleUrl: string) {
  const setup = await startSharedGoogleSetup(orm, googleUrl);
  const relay = stubGoogleRelay();
  const grant = await googleRelayGrant(googleUrl, setup.authorization);
  relay.redeem.mockReturnValueOnce(Response.json(grant));
  const owner = await setup.connection.finishConsent(SETUP_HOLDER, {
    ...setup.input,
    state: setup.state,
    handle: RELAY_HANDLE,
  });
  return { setup, relay, owner };
}
