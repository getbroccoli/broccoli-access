export const USER_WRITE_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";
export const NEW_USER = {
  primaryEmail: "broccoli@acme.example",
  name: { givenName: "Broccoli", familyName: "Access" },
  password: "acme-demo-first-password",
  changePasswordAtNextLogin: false,
};

export function insertGoogleUser(url: string, token: string, user: object = NEW_USER) {
  return fetch(`${url}/admin/directory/v1/users`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(user),
  });
}

export function updateGoogleUser(url: string, token: string, userKey: string, suspended: boolean) {
  return fetch(`${url}/admin/directory/v1/users/${encodeURIComponent(userKey)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ suspended }),
  });
}
