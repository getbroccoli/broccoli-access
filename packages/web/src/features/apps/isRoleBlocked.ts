/** Whether the app's role needs the owner first: its templates disagree, or its app no longer offers it. */
export function isRoleBlocked(row: {
  role?: string | null;
  roleConflict: boolean;
  app: { roles: readonly { key: string }[] };
}): boolean {
  const retiredRole = row.role != null && !row.app.roles.some(({ key }) => key === row.role);
  return row.roleConflict || retiredRole;
}
