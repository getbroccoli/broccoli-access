/** The image type the bytes start with, among the raster types browsers show; null otherwise. */
export function imageTypeOf(content: Buffer): ImageType | null {
  const match = SIGNATURES.find(({ signature }) =>
    content.subarray(0, signature.length).equals(signature),
  );
  return match?.type ?? null;
}

export type ImageType = "image/jpeg" | "image/png" | "image/gif";

/** Each type's leading bytes, from its format's specification. */
const SIGNATURES: { type: ImageType; signature: Buffer }[] = [
  { type: "image/jpeg", signature: Buffer.from([0xff, 0xd8, 0xff]) },
  { type: "image/png", signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: "image/gif", signature: Buffer.from("GIF87a", "ascii") },
  { type: "image/gif", signature: Buffer.from("GIF89a", "ascii") },
];
