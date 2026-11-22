/**
 * Acme, the demo company the fake Google serves. Its numbers are the circle 1 design canvas's,
 * and tests import it for their expected values, so it is fixed data with no randomness.
 */
export interface AcmeSeed {
  customer: SeedCustomer;
  /** The instance's own Google app, used in development and tests; not one of the apps. */
  oauthClient: SeedOAuthClient;
  people: SeedPerson[];
  apps: SeedApp[];
  grants: SeedGrant[];
}

export interface SeedCustomer {
  id: string;
  domain: string;
  organizationName: string;
  creationTime: string;
}

export interface SeedOAuthClient {
  clientId: string;
  clientSecret: string;
  name: string;
}

export interface SeedPerson {
  /** The Google user id. */
  id: string;
  email: string;
  givenName: string;
  familyName: string;
  managerEmail: string | null;
  isSuperAdmin: boolean;
  suspended: boolean;
  creationTime: string;
}

export interface SeedApp {
  clientId: string;
  name: string;
}

export interface SeedGrant {
  email: string;
  clientId: string;
  scopes: string[];
  /** Whole days between the grant and the fake's start, so the grant log always splits the seed alike. */
  daysBeforeStart: number;
}

const DOMAIN = "acme.example";
const SIGN_IN_SCOPES = ["openid", "email", "profile"];

const NAMED_PEOPLE: NamedPerson[] = [
  { name: "Mia Novak", email: "admin", manager: null, apps: ["Slack"] },
  { name: "David Okafor", manager: "admin", apps: ["Figma", "Miro", "Notion", "Slack"] },
  { name: "Elif Demir", manager: "admin", apps: ["Figma", "Notion", "Slack"] },
  { name: "Hannah Weber", manager: "admin", apps: ["Figma", "Loom", "Notion", "Slack"] },
  { name: "Ana Ruiz", manager: "david", suspended: true, apps: ["Figma", "Notion", "Slack"] },
  { name: "Ben Ito", manager: "david", suspended: true, apps: ["Slack"] },
  {
    name: "Chloé Martin",
    email: "chloe",
    manager: "david",
    apps: ["Figma", "Notion", "Slack", "Miro", "Loom"],
  },
  { name: "Farah Haddad", manager: "elif", apps: ["Claude", "Figma", "Notion", "Slack", "Loom"] },
  { name: "Gabriel Silva", manager: "elif", apps: ["Claude", "Figma", "Slack"] },
  { name: "Ivan Petrov", manager: "elif", apps: ["Notion"] },
  { name: "Jun Park", manager: "hannah", apps: ["Claude", "Figma", "Miro", "Notion", "Slack"] },
  { name: "Lena Fischer", manager: "hannah", apps: ["Figma", "Slack"] },
];

/** Generated demo names that fill Acme up to 42 people. */
const GENERATED_NAMES = [
  "Aisha Khan",
  "Bruno Costa",
  "Carmen Vega",
  "Daniel Byrne",
  "Emma Lindqvist",
  "Felix Wagner",
  "Grace Mensah",
  "Hugo Laurent",
  "Isla Murray",
  "Jonas Berg",
  "Kira Sato",
  "Leo Moretti",
  "Maya Cohen",
  "Noah Brennan",
  "Olivia Grant",
  "Pablo Ortega",
  "Quinn Taylor",
  "Rosa Almeida",
  "Samir Aziz",
  "Tara Nolan",
  "Umar Farouk",
  "Vera Kowalski",
  "Will Harper",
  "Xenia Volkova",
  "Yusuf Arslan",
  "Zoe Clarke",
  "Nadia Rahman",
  "Oscar Lindgren",
  "Priya Nair",
  "Theo Duval",
];

/** Generated people report to these, so the managers form a small tree under Mia. */
const TEAM_LEADS = ["david", "elif", "hannah", "chloe", "jun"];

/**
 * The canvas's apps with their people counts. `firstGrantDaysBeforeStart` puts every grant of
 * the app inside the 180-day grant log, its first one that many days before start.
 */
const COUNTED_APPS: CountedApp[] = [
  { name: "Slack", clientId: "551234567890-slack", people: 41 },
  { name: "Notion", clientId: "621234567890-notion", people: 31 },
  { name: "Figma", clientId: "871234567890-figma", people: 16 },
  { name: "Miro", clientId: "431234567890-miro", people: 12 },
  { name: "Loom", clientId: "761234567890-loom", people: 11 },
  { name: "Claude", clientId: "301234567890-claude", people: 9, firstGrantDaysBeforeStart: 142 },
  { name: "ChatGPT", clientId: "381234567890-chatgpt", people: 7, firstGrantDaysBeforeStart: 163 },
  { name: "Canva", clientId: "241234567890-canva", people: 5 },
  {
    name: "Calendly",
    clientId: "651234567890-calendly",
    people: 4,
    firstGrantDaysBeforeStart: 108,
  },
  { name: "Zoom", clientId: "191234567890-zoom", people: 4 },
  { name: "Typeform", clientId: "921234567890-typeform", people: 3, firstGrantDaysBeforeStart: 52 },
  {
    name: "Grammarly",
    clientId: "481234567890-grammarly",
    people: 2,
    firstGrantDaysBeforeStart: 40,
  },
];

/** The 25 smaller apps, each with one or two generated people. */
const SMALL_APP_NAMES = [
  "Asana",
  "Trello",
  "Dropbox",
  "Zapier",
  "HubSpot",
  "Airtable",
  "DocuSign",
  "Lucidchart",
  "Mailchimp",
  "Intercom",
  "Pipedrive",
  "Todoist",
  "Webflow",
  "Hotjar",
  "Mural",
  "Pitch",
  "Otter",
  "Descript",
  "Toggl",
  "Harvest",
  "Lattice",
  "Smartsheet",
  "Box",
  "Coda",
  "PandaDoc",
];

/** Single grants the canvas dates inside the log, by email and app. */
const DATED_GRANTS = [
  { email: `gabriel@${DOMAIN}`, app: "Figma", daysBeforeStart: 101 },
  { email: `lena@${DOMAIN}`, app: "Figma", daysBeforeStart: 76 },
];

/** Grants the canvas does not date are older than the 180-day grant log: at least this many days. */
const UNLOGGED_GRANT_MIN_DAYS = 181;

/** Unlogged grants spread over about two years before the log, so their dates look real. */
const UNLOGGED_GRANT_SPREAD_DAYS = 700;

/** Accounts were created one after another from this day, Acme's first Google year. */
const FIRST_ACCOUNT_CREATED = Date.UTC(2021, 3, 1);
const DAYS_BETWEEN_ACCOUNTS = 23;

const DAY_MS = 24 * 60 * 60 * 1000;

export const ACME: AcmeSeed = buildAcme();

function buildAcme(): AcmeSeed {
  const named = NAMED_PEOPLE.map(namedPerson);
  const generated = GENERATED_NAMES.map(generatedPerson);
  const people = [...named, ...generated].map((person, index) => toSeedPerson(person, index));
  const apps = [
    ...COUNTED_APPS.map(({ name, clientId }) => ({ name, clientId: googleClientId(clientId) })),
    ...SMALL_APP_NAMES.map((name, index) => ({ name, clientId: smallAppClientId(name, index) })),
  ];
  return {
    customer: {
      id: "C03acme01",
      domain: DOMAIN,
      organizationName: "Acme",
      creationTime: "2021-03-02T09:00:00.000Z",
    },
    oauthClient: {
      clientId: googleClientId("123456789012-acme"),
      clientSecret: "acme-broccoli-access-fake-secret",
      name: "Broccoli Access",
    },
    people,
    apps,
    grants: datedGrants([...countedAppGrants(named, generated), ...smallAppGrants(generated)]),
  };
}

interface NamedPerson {
  name: string;
  /** The address's local part; defaults to the lowercased first name. */
  email?: string;
  /** The manager's local part. */
  manager: string | null;
  suspended?: boolean;
  apps: string[];
}

interface CountedApp {
  name: string;
  clientId: string;
  people: number;
  firstGrantDaysBeforeStart?: number;
}

interface DraftPerson {
  givenName: string;
  familyName: string;
  localPart: string;
  manager: string | null;
  suspended: boolean;
  apps: string[];
}

interface DraftGrant {
  email: string;
  app: string;
  clientId: string;
}

function namedPerson({ name, email, manager, suspended, apps }: NamedPerson): DraftPerson {
  const [givenName = "", familyName = ""] = name.split(" ");
  return {
    givenName,
    familyName,
    localPart: email ?? givenName.toLowerCase(),
    manager,
    suspended: suspended ?? false,
    apps,
  };
}

function generatedPerson(name: string, index: number): DraftPerson {
  const [givenName = "", familyName = ""] = name.split(" ");
  return {
    givenName,
    familyName,
    localPart: givenName.toLowerCase(),
    manager: TEAM_LEADS[index % TEAM_LEADS.length] ?? null,
    suspended: false,
    apps: [],
  };
}

function toSeedPerson(person: DraftPerson, index: number): SeedPerson {
  return {
    id: googleUserId(person.localPart, index),
    email: `${person.localPart}@${DOMAIN}`,
    givenName: person.givenName,
    familyName: person.familyName,
    managerEmail: person.manager === null ? null : `${person.manager}@${DOMAIN}`,
    isSuperAdmin: person.localPart === "admin",
    suspended: person.suspended,
    creationTime: new Date(
      FIRST_ACCOUNT_CREATED + index * DAYS_BETWEEN_ACCOUNTS * DAY_MS,
    ).toISOString(),
  };
}

/** Ana's and Chloé's ids are the ones the design's examples show. */
function googleUserId(localPart: string, index: number): string {
  if (localPart === "ana") return "104857392018374650123";
  if (localPart === "chloe") return "104857392018374650456";
  return `104857392018374${651000 + index}`;
}

function googleClientId(prefix: string): string {
  return `${prefix}.apps.googleusercontent.com`;
}

function smallAppClientId(name: string, index: number): string {
  return googleClientId(`90000000${String(index + 10).padStart(4, "0")}-${name.toLowerCase()}`);
}

/** Named people get exactly their listed apps; generated people fill each app's count, in turn. */
function countedAppGrants(named: DraftPerson[], generated: DraftPerson[]): DraftGrant[] {
  return COUNTED_APPS.flatMap((app, appIndex) => {
    const namedHolders = named.filter((person) => person.apps.includes(app.name));
    const generatedHolders = rotated(generated, appIndex * 5).slice(
      0,
      app.people - namedHolders.length,
    );
    return [...namedHolders, ...generatedHolders].map((person) => ({
      email: `${person.localPart}@${DOMAIN}`,
      app: app.name,
      clientId: googleClientId(app.clientId),
    }));
  });
}

/** Even-numbered small apps have two people, odd-numbered ones a single person. */
function smallAppGrants(generated: DraftPerson[]): DraftGrant[] {
  return SMALL_APP_NAMES.flatMap((name, index) => {
    const holders = rotated(generated, index * 7).slice(0, index % 2 === 0 ? 2 : 1);
    return holders.map((person) => ({
      email: `${person.localPart}@${DOMAIN}`,
      app: name,
      clientId: smallAppClientId(name, index),
    }));
  });
}

/** The list starting at `start`, wrapping around, so each app's people come from another part of it. */
function rotated<T>(items: T[], start: number): T[] {
  const offset = start % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function datedGrants(grants: DraftGrant[]): SeedGrant[] {
  const positionInApp = new Map<string, number>();
  return grants.map((grant, index) => {
    const position = positionInApp.get(grant.app) ?? 0;
    positionInApp.set(grant.app, position + 1);
    return {
      email: grant.email,
      clientId: grant.clientId,
      scopes: SIGN_IN_SCOPES,
      daysBeforeStart: grantDaysBeforeStart(grant, position, index),
    };
  });
}

/** A recent app's grants spread from its first grant towards start; any other grant predates the log. */
function grantDaysBeforeStart(grant: DraftGrant, position: number, index: number): number {
  const dated = DATED_GRANTS.find(({ email, app }) => email === grant.email && app === grant.app);
  if (dated) return dated.daysBeforeStart;
  const app = COUNTED_APPS.find(({ name }) => name === grant.app);
  const first = app?.firstGrantDaysBeforeStart;
  if (app && first !== undefined) return first - Math.floor((position * first) / app.people);
  return UNLOGGED_GRANT_MIN_DAYS + ((index * 37) % UNLOGGED_GRANT_SPREAD_DAYS);
}
