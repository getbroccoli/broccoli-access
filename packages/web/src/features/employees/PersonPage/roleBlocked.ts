/** Whether the owner can settle the app's role conflict on its row: its app still offers one of the roles its templates give. */
export function hasRoleToPick(row: {
  roleSources: readonly { role?: string | null }[];
  app: { roles: readonly { key: string; isDefault: boolean }[] };
}): boolean {
  return row.roleSources.some(
    ({ role }) =>
      role == null || row.app.roles.some((option) => option.key === role && !option.isDefault),
  );
}
