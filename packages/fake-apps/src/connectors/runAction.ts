import type {
  ActionRunAnswer,
  ActionRunRequest,
  ConnectorErrorAnswer,
} from "@broccoli-access/connector-contract";

import type { SeedMember } from "../seed";
import { valuesOf, type ActingConnection } from "./actingConnection";
import { errorAnswer } from "./answerCall";
import { invite, withoutRole } from "./invitations";

type ActionAnswer = ActionRunAnswer | ConnectorErrorAnswer;

type Invite = Extract<ActionRunRequest, { action: "invite" }>;
type MemberAction = Exclude<ActionRunRequest, Invite>;

/**
 * Changes exactly one matching member, or invites an email, as the connection's member; the
 * answer reads memory after it, and a change that changed something is kept for the state.
 */
export function runAction(connection: ActingConnection, request: ActionRunRequest): ActionAnswer {
  const answer =
    request.action === "invite"
      ? inviteAnswer(connection, request.account)
      : memberAnswer(connection, request);
  if ("changed" in answer && answer.changed) {
    const { connector, state, actor } = connection;
    const { action, account } = request;
    const changes = state.changes[connector.description.key];
    changes.push({ action, email: account.email, madeBy: actor.email });
    if (changes.length > MAX_CHANGES) changes.shift();
  }
  return answer;
}

/** The last changes a workspace keeps: far more than a test makes, so a long run stays small. */
const MAX_CHANGES = 100;

function inviteAnswer(connection: ActingConnection, account: Invite["account"]): ActionRunAnswer {
  const result = invite(connection.connector, connection.state, account);
  if ("member" in result) return { changed: false, account: readBack(result.member, connection) };
  return { changed: result.sent, invitation: withoutRole(result.invitation) };
}

function memberAnswer(
  connection: ActingConnection,
  { action, account }: MemberAction,
): ActionAnswer {
  const members = connection.state.members[connection.connector.description.key];
  const matches = members.filter(
    (member) => member.sourceKey === account.sourceKey && member.email === account.email,
  );
  const [member] = matches;
  if (matches.length > 1) return errorAnswer("account_not_found");
  if (action === "remove") return removeAnswer(connection, members, member);
  if (member === undefined) return errorAnswer("account_not_found");
  const status = action === "suspend" ? "suspended" : "active";
  const changed = member.status !== status;
  member.status = status;
  return { changed, account: readBack(member, connection) };
}

/** A member who is already gone is removed; the connection's own member never is. */
function removeAnswer(
  { actor }: ActingConnection,
  members: SeedMember[],
  member: SeedMember | undefined,
): ActionAnswer {
  if (member === undefined) return { changed: false, removed: true };
  if (member.status !== "suspended" || member.sourceKey === actor.sourceKey)
    return errorAnswer("not_allowed");
  members.splice(members.indexOf(member), 1);
  return { changed: true, removed: true };
}

function readBack(member: SeedMember, { actor }: ActingConnection) {
  return { sourceKey: member.sourceKey, values: valuesOf(member, actor) };
}
