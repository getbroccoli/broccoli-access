import { startSimpleHttpServer } from "./simpleHttpServer";

/** Forwards Google GET requests unchanged and records paths to count reads across retries. */
export async function startCountingGoogleProxy(googleUrl: string) {
  const paths: string[] = [];
  const server = await startSimpleHttpServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    const path = request.url ?? "/";
    paths.push(path);
    void fetch(`${googleUrl}${path}`, {
      headers: { authorization: request.headers.authorization ?? "" },
    })
      .then(async (upstream) => {
        const body = await upstream.text();
        response.writeHead(upstream.status, {
          "content-type": upstream.headers.get("content-type") ?? "application/json",
        });
        response.end(body);
      })
      .catch(() => response.destroy());
  });
  return { ...server, paths };
}
