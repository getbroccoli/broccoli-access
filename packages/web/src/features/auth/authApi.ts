import { postJson } from "@/lib/postJson";

/** Ends the session on the server; false when it could not. */
export async function signOut(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/sign-out", {})).ok;
  } catch {
    return false;
  }
}
