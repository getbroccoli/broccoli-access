type ConnectorScan = { connection: { scan: { status: string } | null } | null };

/** Whether a connected app's scan is queued or running: its end changes the users and counts shown. */
export function isAnyAppScanning(connectors: readonly ConnectorScan[]): boolean {
  return connectors.some(({ connection }) => connection?.scan?.status === "SCANNING");
}
