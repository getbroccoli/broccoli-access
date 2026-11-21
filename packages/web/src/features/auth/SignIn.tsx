import { useRouteContext, useSearch } from "@tanstack/react-router";

import { LoginForm } from "./LoginForm";

/** The login page's form: email and password. */
export function SignIn() {
  const { passwordResetByEmail } = useRouteContext({ from: "/login" });
  const { reset } = useSearch({ from: "/login" });
  return <LoginForm forgotPassword={passwordResetByEmail} passwordChanged={reset === "done"} />;
}
