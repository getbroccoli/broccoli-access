import type { Request, Router } from "express";

import type { Auth } from "./createBetterAuth";

/** What setup and sign-in add to the server: its auth, its routes and the address browsers use. */
export interface DeploymentServer {
  auth: Auth;
  /** Routes that run before the auth handler and the modules, such as setup guards. */
  router: Router;
  /** The origin browsers reach this instance at, for links that leave Broccoli Access and come back. */
  publicOrigin: (request: Request) => Promise<string>;
}
