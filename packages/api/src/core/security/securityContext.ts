import type { IncomingHttpHeaders } from "node:http";

import { ApplicationError } from "../applicationError";
import {
  type EffectiveProfile,
  type Grant,
  type Operation,
  PERMISSION_PROFILES,
  type PermissionObject,
  type PermissionProfile,
  type ProfileDefinition,
  type RecordAction,
  type RecordScope,
  type Scope,
  type Subject,
} from "./permissions";
import { isInRecordScope } from "./recordScope";

/**
 * Who is calling application code, and what they may do. Every business function
 * in `app` takes it first, as `ctx`. A hand-written interface, unlike our other
 * code, so tests can implement it (`TestSecurityContext`).
 */
export interface SecurityContext {
  /**
   * The effective signed-in user; null for work Broccoli Access does on its own and for the
   * setup holder. A request without either session has no security context at all.
   */
  readonly user: Readonly<SignedInUser> | null;

  /** Whether Broccoli Access acts on its own; then `user` is null. */
  readonly isSystem: boolean;

  /** Whether the browser holding setup calls, before the owner exists; then `user` is null. */
  readonly isSetupHolder: boolean;

  /** Whether the caller holds the operation; system always does. */
  can(operation: Operation): boolean;

  /** Refuses with FORBIDDEN, naming who may do it, unless the caller holds the operation. */
  require(operation: Operation): void;

  /** Broccoli Access's own work, which no user starts; refuses everyone else with FORBIDDEN. */
  requireSystem(): void;

  /** Setup's own work, such as connecting Google; refuses everyone but the setup holder with FORBIDDEN. */
  requireSetupHolder(): void;

  /**
   * Refuses with FORBIDDEN unless the caller's grants reach every record of the object for the
   * action: creating a record tied to nobody yet, and ids that name no record.
   */
  requireEveryRecord(object: PermissionObject, action: RecordAction): void;

  /**
   * The records the caller's grants reach for the action, by subject, to filter reads before
   * paging; read once per context for each object and action. Never refuses: see `RecordScope`.
   */
  recordScope(object: PermissionObject, action: RecordAction): Promise<RecordScope>;

  /** Refuses with FORBIDDEN unless the record of this subject is in scope for the action. */
  requireInScope(object: PermissionObject, action: RecordAction, subject: Subject): Promise<void>;

  /**
   * Refuses with FORBIDDEN an update of these subjects' records when one is out of scope, or one
   * that sends a field the caller may not change, naming each such field.
   */
  requireWrite(
    object: PermissionObject,
    subjects: readonly Subject[],
    fields: readonly string[],
  ): Promise<void>;

  /** What the caller may do to the record of each subject, fixed rules applied, by subject. */
  recordAccess(
    object: PermissionObject,
    subjects: readonly Subject[],
  ): Promise<Map<Subject, RecordAccess>>;
}

/** What the caller may do to one record. */
export interface RecordAccess {
  canUpdate: boolean;
  canDelete: boolean;
  /** "*" for every ordinary editable field; empty unless `canUpdate`. */
  writableFields: "*" | readonly string[];
}

/** What permission checks read about people; the module that keeps employees provides it. */
export interface EmployeeDirectory {
  /** The employee linked to this user; null without one. */
  employeeIdOfUser(userId: string): Promise<string | null>;
  /** The employee linked to the owner's user; null without one. */
  ownersEmployeeId(): Promise<string | null>;
}

/** A signed-in user as application code sees them. */
export interface SignedInUser {
  userId: string;
  /** Sign-in email, lowercased, for display; never used for authorization. */
  email: string;
  isOwner: boolean;
  /** `EMPLOYEE` first, and `OWNER` for the owner (`profilesOf`). */
  permissionProfiles: readonly PermissionProfile[];
  /** The employee linked to this user; null without one. */
  employeeId: string | null;
}

const OPERATION_REFUSALS: Record<Operation, string> = {
  MANAGE_WORKSPACE: "Only admins can do this.",
};

const NOT_ALLOWED = "You are not allowed to do this.";

/** The security context of a user, the setup holder or Broccoli Access itself. */
export class PrincipalSecurityContext implements SecurityContext {
  private constructor(
    readonly user: Readonly<SignedInUser> | null,
    readonly isSetupHolder: boolean,
    private readonly directory: EmployeeDirectory | null = null,
    private readonly profiles: Record<PermissionProfile, ProfileDefinition> = PERMISSION_PROFILES,
  ) {}

  private ownersEmployeeId: Promise<string | null> | undefined;
  private effective: EffectiveProfile | undefined;

  /** A signed-in user; built by `resolveSecurityContext`, and by tests with other profiles. */
  static user(
    user: SignedInUser,
    directory: EmployeeDirectory,
    profiles?: Record<PermissionProfile, ProfileDefinition>,
  ): SecurityContext {
    return new PrincipalSecurityContext({ ...user }, false, directory, profiles);
  }

  /** The browser holding setup; built by `resolveSecurityContext`. */
  static setupHolder(): SecurityContext {
    return new PrincipalSecurityContext(null, true);
  }

  /** Broccoli Access acting on its own: setup, sign-in and event handlers. */
  static system(): SecurityContext {
    return new PrincipalSecurityContext(null, false);
  }

  get isSystem(): boolean {
    return this.user === null && !this.isSetupHolder;
  }

  can(operation: Operation): boolean {
    return this.isSystem || this.profile()?.operations.has(operation) === true;
  }

  require(operation: Operation): void {
    if (!this.can(operation)) {
      throw new ApplicationError("FORBIDDEN", OPERATION_REFUSALS[operation]);
    }
  }

  requireSystem(): void {
    if (!this.isSystem) {
      throw new ApplicationError("FORBIDDEN", "Only Broccoli Access can do this.");
    }
  }

  requireSetupHolder(): void {
    if (!this.isSetupHolder) {
      throw new ApplicationError("FORBIDDEN", "Only the browser holding setup can do this.");
    }
  }

  requireEveryRecord(object: PermissionObject, action: RecordAction): void {
    if (!this.isSystem && !this.grants(object, action).some(({ scope }) => scope === "all")) {
      throw new ApplicationError("FORBIDDEN", NOT_ALLOWED);
    }
  }

  recordScope(object: PermissionObject, action: RecordAction): Promise<RecordScope> {
    if (this.isSystem) return Promise.resolve("all");
    return this.resolveScope(
      this.grants(object, action).map(({ scope }) => scope),
      action,
    );
  }

  async requireInScope(
    object: PermissionObject,
    action: RecordAction,
    subject: Subject,
  ): Promise<void> {
    const access = await this.actionsOn(object, subject, [action]);
    if (!access.has(action)) {
      throw new ApplicationError("FORBIDDEN", NOT_ALLOWED);
    }
    if (action === "delete" && (await this.isOwnersEmployee(object, subject))) {
      throw new ApplicationError("FORBIDDEN", "The owner cannot be deleted.");
    }
  }

  async requireWrite(
    object: PermissionObject,
    subjects: readonly Subject[],
    fields: readonly string[],
  ): Promise<void> {
    const access = await this.actionsOnEach(object, subjects, ["update"]);
    const writables = [...access.values()].map((actions) => actions.get("update"));
    if (writables.some((writable) => !writable)) {
      throw new ApplicationError("FORBIDDEN", NOT_ALLOWED);
    }
    const refused = fields.filter((field) =>
      writables.some((writable) => writable !== "*" && !writable!.includes(field)),
    );
    if (refused.length > 0) {
      throw new ApplicationError(
        "FORBIDDEN",
        "You cannot change some of these fields.",
        refused.map((field) => ({ field, code: "not_allowed" })),
      );
    }
  }

  async recordAccess(
    object: PermissionObject,
    subjects: readonly Subject[],
  ): Promise<Map<Subject, RecordAccess>> {
    const access = await this.actionsOnEach(object, subjects, ["update", "delete"]);
    const records = new Map<Subject, RecordAccess>();
    for (const [subject, actions] of access) {
      records.set(subject, {
        canUpdate: actions.has("update"),
        canDelete: actions.has("delete") && !(await this.isOwnersEmployee(object, subject)),
        writableFields: actions.get("update") ?? [],
      });
    }
    return records;
  }

  /** The union of the user's profiles; null for anyone without a user. */
  private profile(): EffectiveProfile | null {
    if (!this.user) return null;
    this.effective ??= {
      grants: this.user.permissionProfiles.flatMap((name) => this.profiles[name].grants),
      operations: new Set(
        this.user.permissionProfiles.flatMap((name) => this.profiles[name].operations),
      ),
    };
    return this.effective;
  }

  private grants(object: PermissionObject, action: RecordAction): readonly Grant[] {
    return (this.profile()?.grants ?? []).filter(
      (grant) => grant.object === object && grant.actions.includes(action),
    );
  }

  /**
   * The subjects these scopes reach together for the action. Every object has employee subjects
   * today: an object about another kind resolves its scopes here.
   */
  private resolveScope(scopes: readonly Scope[], action: RecordAction): Promise<RecordScope> {
    if (scopes.includes("all")) return Promise.resolve("all");
    if (scopes.length === 0) return Promise.resolve("none");
    // Public records: every read grant reaches them, only grants on `all` write them.
    const reached = new Set<Subject>(action === "read" ? ["public"] : []);
    const employeeId = this.user?.employeeId;
    if (employeeId && scopes.includes("self")) reached.add(employeeId);
    return Promise.resolve([...reached]);
  }

  /** The actions among `actions` the caller holds on the subject, each with the fields it may write. */
  private async actionsOn(
    object: PermissionObject,
    subject: Subject,
    actions: readonly RecordAction[],
  ): Promise<Map<RecordAction, "*" | readonly string[]>> {
    return (await this.actionsOnEach(object, [subject], actions)).get(subject)!;
  }

  /** `actionsOn` for each subject, by subject; each grant's scope is resolved once for them all. */
  private async actionsOnEach(
    object: PermissionObject,
    subjects: readonly Subject[],
    actions: readonly RecordAction[],
  ): Promise<Map<Subject, Map<RecordAction, "*" | readonly string[]>>> {
    const access = new Map(
      subjects.map((subject) => [subject, new Map<RecordAction, "*" | readonly string[]>()]),
    );
    for (const action of actions) {
      const grants: readonly Pick<Grant, "scope" | "fields">[] = this.isSystem
        ? [{ scope: "all", fields: "*" }]
        : this.grants(object, action);
      for (const grant of grants) {
        const scope = await this.resolveScope([grant.scope], action);
        for (const [subject, held] of access) {
          if (!isInRecordScope(scope, subject)) continue;
          const before = held.get(action) ?? [];
          const fields = grant.fields ?? [];
          held.set(
            action,
            before === "*" || fields === "*" ? "*" : [...new Set([...before, ...fields])],
          );
        }
      }
    }
    return access;
  }

  /** Whether the record is the owner's employee, which nobody deletes. */
  private async isOwnersEmployee(object: PermissionObject, subject: Subject): Promise<boolean> {
    if (object !== "employee") return false;
    // Read once per context, which lives for one request.
    this.ownersEmployeeId ??= this.directory?.ownersEmployeeId() ?? Promise.resolve(null);
    return (await this.ownersEmployeeId) === subject;
  }
}

/** The security context of a request, and the session cookies to send back with the response. */
export interface RequestSecurity {
  /** Null without a valid session. */
  security: SecurityContext | null;
  /** `Set-Cookie` values for a session that was due for renewal; empty otherwise. */
  renewedCookies: string[];
}

/** Reads the security context of a request from its headers; see `resolveSecurityContext`. */
export type SecurityResolver = (headers: IncomingHttpHeaders) => Promise<RequestSecurity>;

/**
 * The security context of a request that needs a signed-in user. Adapters (GraphQL,
 * HTTP) call it, so application code always receives a context.
 */
export function requireSignedIn(security: SecurityContext | null): SecurityContext {
  if (!security) {
    throw new ApplicationError("UNAUTHENTICATED", "Sign in to continue.");
  }
  return security;
}
