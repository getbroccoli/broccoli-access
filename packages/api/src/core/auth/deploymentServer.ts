import type { Request, Router } from "express";

import type { AuthSource } from "./authSource";

/** What setup and sign-in add to the server: its auth, its routes and the address browsers use. */
export interface DeploymentServer {
  auth: AuthSource;
  /** Routes that run before the auth handler and the modules, such as setup guards. */
  router: Router;
  /** The origin browsers reach this instance at, for links that leave Broccoli Access and come back. */
  publicOrigin: (request: Request) => Promise<string>;
}
