import {
  mutationPayload,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { SecurityContext } from "../../../core/security";
import type { ProvisionService } from "../app";

/** The employees module reads the people this caller may see. */
export type ReadEmployees = (
  ctx: SecurityContext,
  ids: readonly string[],
) => Promise<Awaited<ResolversTypes["Employee"]>[]>;

export const provisionStepResolvers: Pick<NonNullable<Resolvers["ProvisionStep"]>, "action"> = {
  action: ({ action }) => toEnum(action),
};

export function provisionMutations(
  services: Pick<ProvisionService, "provisionEmployee">,
  readEmployees: ReadEmployees,
): Pick<NonNullable<Resolvers["AppsMutations"]>, "provisionEmployee"> {
  return {
    provisionEmployee: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["EmployeeProvisionPayload"]>(async () => {
        const ctx = context.getActor();
        await services.provisionEmployee(ctx, input);
        const [employee] = await readEmployees(ctx, [input.employeeId]);
        return { employee: employee ?? null };
      }, ["NOT_FOUND", "CONFLICT"]),
  };
}
