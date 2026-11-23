import type { JobName, JobQueue, Jobs } from "../../src/core/jobs";

/** Records queued work; the core job runner has its own integration tests. */
export function recordingJobQueue() {
  const sent: { name: JobName; payload: Jobs[JobName]; options?: { group?: string } }[] = [];
  const jobs: JobQueue = {
    send: (_tx, name, payload, options) => {
      sent.push(options ? { name, payload, options } : { name, payload });
      return Promise.resolve();
    },
  };
  return { jobs, sent };
}
