/** Whether the company uses an app: found by a scan, chosen by the owner, or set aside. */
export const APP_STATUSES = ["discovered", "approved", "ignored"] as const;

export type AppStatus = (typeof APP_STATUSES)[number];
