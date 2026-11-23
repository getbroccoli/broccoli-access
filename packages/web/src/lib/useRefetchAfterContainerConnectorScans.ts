import { useQuery } from "@apollo/client/react";
import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { ContainerConnectorScansDocument } from "@/__generated__/graphql";

import { usePollWhileScanning } from "./usePollWhileScanning";

/**
 * Calls `refetch` each time a container connector's scan ends, wherever it started, and polls their
 * status while one runs. Its own query, so a slow connectors container holds no other read back.
 */
export function useRefetchAfterContainerConnectorScans(refetch: () => unknown): void {
  const { me } = useRouteContext({ from: "/_authenticated" });
  // A scan started elsewhere, such as from another tab, changes the connections outside this cache.
  const query = useQuery(ContainerConnectorScansDocument, {
    skip: !me.operations.includes("MANAGE_WORKSPACE"),
    fetchPolicy: "cache-and-network",
  });
  // A string, so the effect below runs only when the set of scanning connectors changes.
  const scanningIds = (query.data?.containerConnectors ?? [])
    .filter(({ connection }) => connection?.scan?.status === "SCANNING")
    .map(({ id }) => id)
    .join(" ");
  usePollWhileScanning(scanningIds !== "", query);
  useRefetchWhenOneEnds(scanningIds, refetch);
}

/** Calls `refetch` once a connector it saw scanning stops, though others still scan. */
function useRefetchWhenOneEnds(scanningIds: string, refetch: () => unknown): void {
  const sawScanning = useRef<string[]>([]);
  useEffect(() => {
    const scanning = scanningIds === "" ? [] : scanningIds.split(" ");
    const oneEnded = sawScanning.current.some((id) => !scanning.includes(id));
    sawScanning.current = scanning;
    if (oneEnded) {
      void refetch();
    }
  }, [scanningIds, refetch]);
}
