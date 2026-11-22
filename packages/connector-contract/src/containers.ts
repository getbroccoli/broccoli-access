import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

/** Two running containers of one image, for the conformance suite. */
export interface RunningContainers {
  /** Where this machine reaches each container's port 4000. */
  urls: [string, string];
  /** Removes both containers. */
  stop: () => Promise<void>;
}

/**
 * Starts two containers of `image` as the contract runs them: a read-only root file system with
 * a temporary folder, port 4000 published on this machine's loopback only. Resolves once both
 * answer `GET /v1/connectors`. `dockerArgs` go to `docker run` before the image, such as
 * `--network` or `--env` for the container to reach its fake apps.
 */
export async function startContainers(
  image: string,
  options: { dockerArgs?: string[] } = {},
): Promise<RunningContainers> {
  const ids: string[] = [];
  const stop = async () => {
    if (ids.length > 0) await docker("rm", "--force", ...ids);
  };
  try {
    for (let index = 0; index < 2; index++) ids.push(await runContainer(image, options.dockerArgs));
    const [url, otherUrl] = await Promise.all(ids.map(readyUrl));
    return { urls: [url!, otherUrl!], stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** Long enough for a container to start its server on a slow CI machine. */
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 250;

/** The lines of a container's own log that a failed start shows. */
const LOG_LINES_ON_FAILURE = "20";

async function runContainer(image: string, dockerArgs: string[] = []): Promise<string> {
  const id = await docker(
    "run",
    "--detach",
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--publish",
    "127.0.0.1::4000",
    ...dockerArgs,
    image,
  );
  return id.trim();
}

async function readyUrl(id: string): Promise<string> {
  const address = (await docker("port", id, "4000/tcp")).split("\n")[0]?.trim();
  const url = `http://${address}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await answersManifest(url)) return url;
    await sleep(READY_POLL_MS);
  }
  const logs = await docker("logs", "--tail", LOG_LINES_ON_FAILURE, id).catch(() => "");
  throw new Error(`Container ${id} did not answer GET /v1/connectors at ${url}:\n${logs}`);
}

async function answersManifest(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/v1/connectors`)).ok;
  } catch {
    return false;
  }
}

async function docker(...args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)("docker", args);
  return stdout;
}
