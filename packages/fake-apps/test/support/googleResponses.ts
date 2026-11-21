export interface DirectoryUser {
  id: string;
  primaryEmail: string;
  suspended: boolean;
  isAdmin: boolean;
  relations?: { type: string; value: string }[];
}

export interface DirectoryToken {
  clientId: string;
  displayText: string;
  scopes: string[];
  userKey: string;
}

export interface GrantEvent {
  id: { time: string; uniqueQualifier: string; applicationName: string; customerId: string };
  actor: { email: string; profileId: string };
  events: {
    type: string;
    name: string;
    parameters: { name: string; value?: string; multiValue?: string[] }[];
  }[];
}

export interface DirectoryUsers {
  kind: string;
  users: DirectoryUser[];
  nextPageToken?: string;
}

export interface DirectoryTokens {
  kind: string;
  items: DirectoryToken[];
}

export interface GrantEvents {
  items: GrantEvent[];
  nextPageToken?: string;
}

export interface FakeState {
  people: number;
  suspendedPeople: number;
  apps: number;
  grants: number;
  events: number;
}

export function eventClientId(event: GrantEvent): string | undefined {
  return event.events[0]?.parameters.find((parameter) => parameter.name === "client_id")?.value;
}
