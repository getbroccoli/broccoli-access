import { useQuery } from "@apollo/client/react";

import { FoundViaConnectorsDocument } from "@/__generated__/graphql";
import { describeFoundVia } from "@/lib/foundVia";

type Props = {
  findingKinds: readonly string[];
};

/** How an app or account was found, naming a container connector's kind after its app. */
export function FoundVia({ findingKinds }: Props) {
  // One read per page serves every row, and picks up a container that was down at the last read.
  const { data } = useQuery(FoundViaConnectorsDocument, { fetchPolicy: "cache-and-network" });
  return <>{describeFoundVia(findingKinds, data?.containerConnectors ?? [])}</>;
}
