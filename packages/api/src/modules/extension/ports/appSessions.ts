/** What the extension module needs from the connectors module: what to collect, and where it goes. */
export interface AppSessions {
  describeAppSession(connector: string): Promise<AppSessionRequest>;
  /** Tests the app session the extension collected for `userId`, and keeps it for their page. */
  handOverAppSession(handOver: {
    userId: string;
    connector: string;
    requestId: string;
    appSession: unknown;
  }): Promise<void>;
}

/** The app's name, and the domains and storage keys of the connector's app session field. */
export interface AppSessionRequest {
  connector: string;
  name: string;
  domains: readonly string[];
  storageKeys: readonly string[];
}
