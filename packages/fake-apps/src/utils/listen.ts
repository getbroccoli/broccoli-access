import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** An HTTP server listening, before any app handles its requests. */
export interface ListeningServer {
  server: Server;
  /** The address it listens on, such as `http://127.0.0.1:<free port>`. */
  url: string;
  stop: () => Promise<void>;
}

/** Listens on `host`, on `port` or a free one, so a fake knows its address before it starts. */
export async function listen(host: string, port = 0): Promise<ListeningServer> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    server,
    url: `http://${host}:${(server.address() as AddressInfo).port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
