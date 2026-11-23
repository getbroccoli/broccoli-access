import { useQuery } from "@apollo/client/react";
import { useRouteContext } from "@tanstack/react-router";

import { AppScansDocument } from "@/__generated__/graphql";

import { isAnyAppScanning } from "./isAnyAppScanning";
import { usePollWhileScanning } from "./usePollWhileScanning";

/**
 * Whether a connected app's scan is queued or running, wherever it started, polled while one is, so
 * a page reads again what its end changes. Its own query: a slow connectors container holds no other back.
 */
export function useIsAppScanning(): boolean {
  const { me } = useRouteContext({ from: "/_authenticated" });
  // A scan started elsewhere, such as from another tab, changes the connections outside this cache.
  const query = useQuery(AppScansDocument, {
    skip: !me.operations.includes("MANAGE_WORKSPACE"),
    fetchPolicy: "cache-and-network",
  });
  const isScanning = isAnyAppScanning(query.data?.containerConnectors ?? []);
  usePollWhileScanning(isScanning, query);
  return isScanning;
}
