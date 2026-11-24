// What this module adds to core's shared registries.

declare module "../../../core/records" {
  interface RecordTypes {
    app: true;
    app_account: true;
    app_connection: true;
  }

  interface CauseKinds {
    /** An account change succeeded; its ref is the account change's id. */
    CHANGED_IN_APP: true;
    /** The owner made a failed account change in the app themselves; its ref is the account change's id. */
    DONE_BY_HAND: true;
    /** A connection turned to Reconnect; its ref is the scan's import source or the account change. */
    CONNECTOR_ERROR: true;
  }
}

declare module "../../../core/jobs" {
  interface Jobs {
    /** Runs one account change through its connector, one per connection at a time. */
    "apps.runAccountChange": { changeId: string };
  }
}

declare module "../../../core/events" {
  interface DomainEvents {
    "apps.accountsChanged": { appIds: string[] };
  }
}

export {};
