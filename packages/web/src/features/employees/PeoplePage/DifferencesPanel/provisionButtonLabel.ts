import type {
  AccountChangeFailure,
  AccountChangeStatus,
  ProvisionAction,
} from "@/__generated__/graphql";

type ReadyRow = {
  provisionStep: { action: ProvisionAction } | null;
  latestProvisionChange: {
    status: AccountChangeStatus;
    failure: AccountChangeFailure | null;
  } | null;
};

export function provisionButtonLabel(ready: readonly ReadyRow[]) {
  const retriesOnly =
    ready.length > 0 &&
    ready.every(
      ({ provisionStep, latestProvisionChange }) =>
        (provisionStep?.action === "INVITE" || provisionStep?.action === "REACTIVATE") &&
        latestProvisionChange?.status === "FAILED" &&
        latestProvisionChange.failure !== "NO_CONNECTION",
    );
  return retriesOnly ? "apps.couldnt.tryAgain" : "people.provision.button";
}
