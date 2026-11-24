// What this module adds to core's shared registries.

declare module "../../../core/records" {
  interface CauseKinds {
    /** A scan found the change; its ref is the import source's id. */
    FOUND_BY_SCAN: true;
  }
}

declare module "../../../core/jobs" {
  interface Jobs {
    /** Reads one import source's connection and syncs what it found. */
    "imports.scanConnection": { sourceId: string };
    /** Queues a scan of every connection; runs once a day. */
    "imports.scanEveryConnection": Record<string, never>;
  }
}

declare module "../../../core/events" {
  interface DomainEvents {
    "imports.appScanned": { appId: string };
  }
}

export {};
