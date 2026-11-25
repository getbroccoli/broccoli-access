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

/** Whether the app's role needs the owner first: its templates disagree, or its app no longer offers it. */
export function isRoleBlocked(row: {
  role?: string | null;
  roleConflict: boolean;
  app: { roles: readonly { key: string }[] };
}): boolean {
  const retiredRole = row.role != null && !row.app.roles.some(({ key }) => key === row.role);
  return row.roleConflict || retiredRole;
}
