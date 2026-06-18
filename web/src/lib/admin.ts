// =============================================================================
// admin.ts — admin gate. SERVER ONLY.
//
// An admin is any logged-in host whose email is listed in the ADMIN_EMAILS
// environment variable (comma-separated). This keeps the admin list out of the
// database (where it could be tampered with) and requires no schema change.
//
// Every admin page/route calls requireAdmin(), and all cross-user data reads use
// the service-role client (which bypasses Row Level Security) ONLY after that
// check passes.
// =============================================================================

import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** Redirects non-admins. Returns the admin user on success. */
export async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin");
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  return user;
}

/** Convenience for non-redirecting checks (e.g. showing an Admin nav link). */
export async function currentUserIsAdmin(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminEmail(user?.email);
}
