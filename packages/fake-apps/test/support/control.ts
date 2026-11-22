import { expect } from "vitest";

export async function control(
  url: string,
  path: string,
  body: Record<string, unknown> = {},
  method = "POST",
): Promise<void> {
  const response = await fetch(`${url}/_fake${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
}
