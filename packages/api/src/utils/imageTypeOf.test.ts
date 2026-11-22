import { expect, it } from "vitest";

import { PNG, JPEG, WEBP } from "#test/support";
import { imageTypeOf } from "./imageTypeOf";

it.each([
  { name: "PNG", content: PNG, expected: "image/png" },
  { name: "JPEG", content: JPEG, expected: "image/jpeg" },
  { name: "GIF89a", content: Buffer.from("GIF89a"), expected: "image/gif" },
  { name: "GIF87a", content: Buffer.from("GIF87a"), expected: "image/gif" },
  { name: "WEBP", content: WEBP, expected: null },
  { name: "plain text", content: Buffer.from("not an image"), expected: null },
  { name: "empty bytes", content: Buffer.alloc(0), expected: null },
])("identifies $name as $expected", ({ content, expected }) => {
  expect(imageTypeOf(content)).toBe(expected);
});
