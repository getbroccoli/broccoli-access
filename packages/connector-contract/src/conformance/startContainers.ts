import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { CONNECTOR_MANIFEST } from "../connectorManifest.js";

/** Two running containers of one image, for the conformance suite. */
export interface RunningContainers {
  /** Where this machine reaches each container's port 4000. */
  urls: [string, string];
  /** Removes both containers and their anonymous volumes. */
  stop: () => Promise<void>;
}

/**
 * Starts two containers of `image` as the contract runs them: a read-only root file system with
 * a temporary folder, port 4000 published on this machine's loopback only. Resolves once both
 * answer `GET /v1/connectors`, after checking that both run the same image with nothing
 * writable but the temporary folder. `dockerArgs` go to `docker run` before the image, such as
 * `--network` or `--env` for the container to reach its fake apps.
 */
export async function startContainers(
  image: string,
  options: { dockerArgs?: string[] } = {},
): Promise<RunningContainers> {
  const ids: string[] = [];
  const stop = async () => {
    if (ids.length > 0) await docker("rm", "--force", "--volumes", ...ids);
  };
  try {
    // One immutable id, so a tag moved by a rebuild cannot give the two containers different images.
    const imageId = (await docker("image", "inspect", "--format", "{{.Id}}", image)).trim();
    for (let index = 0; index < 2; index++) {
      ids.push(await createContainer(imageId, options.dockerArgs));
    }
    for (const id of ids) await expectReadOnly(id);
    // Started only once created, so a container that fails to start is still removed.
    await docker("start", ...ids);
    const [url, otherUrl] = await Promise.all(ids.map(readyUrl));
    return { urls: [url!, otherUrl!], stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** The one writable folder the contract gives the container, for its browser. */
const TEMPORARY_FOLDER = "/tmp";

/** Long enough for a container to start its server on a slow CI machine. */
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 250;

/** One readiness probe's limit, so a container that never answers cannot outlast the deadline. */
const PROBE_TIMEOUT_MS = 5_000;

/** The lines of a container's own log that a failed start shows. */
const LOG_LINES_ON_FAILURE = "20";

async function createContainer(imageId: string, dockerArgs: string[] = []): Promise<string> {
  const id = await docker(
    "create",
    "--read-only",
    "--tmpfs",
    TEMPORARY_FOLDER,
    "--publish",
    "127.0.0.1::4000",
    ...dockerArgs,
    imageId,
  );
  return id.trim();
}

/**
 * `dockerArgs` could undo `--read-only` or add a writable folder, and an image's volumes stay
 * writable despite it: only the contract's temporary folder may be written.
 */
async function expectReadOnly(id: string): Promise<void> {
  const inspected = await docker("inspect", "--format", "{{json .}}", id);
  const { HostConfig, Mounts } = JSON.parse(inspected) as {
    HostConfig: { ReadonlyRootfs: boolean; Tmpfs: Record<string, string> | null };
    Mounts: { RW: boolean; Destination: string }[];
  };
  const writable = [
    ...Mounts.filter((mount) => mount.RW).map((mount) => mount.Destination),
    ...Object.keys(HostConfig.Tmpfs ?? {}).filter((folder) => folder !== TEMPORARY_FOLDER),
  ];
  if (!HostConfig.ReadonlyRootfs || writable.length > 0) {
    throw new Error(
      `Container ${id} must have a read-only root file system and no writable mount; writable: ${writable.join(", ") || "its root"}`,
    );
  }
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
  throw new Error(
    `Container ${id} did not answer GET /v1/connectors with a manifest at ${url}:\n${logs}`,
  );
}

async function answersManifest(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/v1/connectors`, {
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.status === 200 && CONNECTOR_MANIFEST.safeParse(await response.json()).success;
  } catch {
    return false;
  }
}

/** Fails with Docker's own message only: the arguments may carry the caller's `--env` values. */
async function docker(...args: string[]): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)("docker", args);
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim() ?? "";
    // eslint-disable-next-line preserve-caught-error -- the cause prints the command line.
    throw new Error(`docker ${args[0]} failed: ${stderr}`);
  }
}
