import type { AccountValues } from "@broccoli-access/connector-contract";

import type { SeedMember } from "../seed";
import type { ConnectorsState } from "./connectorsState";
import type { FakeConnector } from "./fakeConnector";

/** A connection whose secrets reach the workspace: every call through it runs as its member. */
export interface ActingConnection {
  connector: FakeConnector;
  state: ConnectorsState;
  /** The member whose key or session the connection uses. */
  actor: SeedMember;
}

/** The member as the contract's wire carries it for a call that runs as `actor`. */
export function valuesOf(member: SeedMember, actor: SeedMember): AccountValues {
  return {
    email: member.email,
    status: member.status,
    displayName: member.displayName,
    isConnectionUser: member.sourceKey === actor.sourceKey,
  };
}
