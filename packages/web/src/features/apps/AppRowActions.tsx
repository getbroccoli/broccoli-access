import { ApproveAppButton } from "./ApproveAppButton";
import type { AppRow } from "./AppTable";
import { useAppStatusChange } from "./useAppStatusChange";

type Props = { app: Pick<AppRow, "id" | "name" | "status"> };

/** Approve at the end of an app's row; Ignore is on the app's page. */
export function AppRowActions({ app }: Props) {
  const { approve, pending } = useAppStatusChange(app);
  return <ApproveAppButton app={app} disabled={pending} onApprove={approve} />;
}
