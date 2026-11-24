/**
 * Requests a binary answer, a GET unless `init` says otherwise, and returns its body.
 * Resolves null on 404. Rejects with `UnsuccessfulAnswerError` on another unsuccessful status,
 * after `timeoutMs`, or on a body over `maxBytes`.
 */
export async function fetchBytes(
  url: URL,
  {
    timeoutMs,
    maxBytes,
    init,
    errorOfResponse,
  }: {
    timeoutMs: number;
    maxBytes: number;
    init?: RequestInit;
    errorOfResponse?: (response: Response) => Promise<Error>;
  },
): Promise<Buffer | null> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok && errorOfResponse) throw await errorOfResponse(response);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new UnsuccessfulAnswerError(init?.method ?? "GET", url, response.status);
  }
  return readBytes(response, maxBytes);
}

/** An answer with an unsuccessful status other than 404, which callers may tell apart by `status`. */
export class UnsuccessfulAnswerError extends Error {
  constructor(
    method: string,
    url: URL,
    readonly status: number,
  ) {
    super(`${method} ${url.origin} answered ${status}`);
    this.name = "UnsuccessfulAnswerError";
  }
}

/** An answer whose body exceeded the bytes its reader allowed. */
export class AnswerTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Answer is larger than ${maxBytes} bytes`);
    this.name = "AnswerTooLargeError";
  }
}

/** The body's bytes; stops reading and fails beyond `maxBytes`. */
export async function readBytes(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AnswerTooLargeError(maxBytes);
    }
    chunks.push(read.value);
  }
  return Buffer.concat(chunks);
}
