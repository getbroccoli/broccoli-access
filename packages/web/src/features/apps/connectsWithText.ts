import type { ConnectionFieldKind } from "@/__generated__/graphql";

/** Whether the owner types every value connecting asks for; an app session comes another way. */
export function connectsWithText({
  connectionFields,
}: {
  connectionFields: readonly { kind: ConnectionFieldKind }[];
}): boolean {
  return connectionFields.every(({ kind }) => kind === "TEXT");
}
