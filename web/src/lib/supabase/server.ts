// =============================================================================
// supabase/server.ts — server-side Supabase client bound to the request cookies.
//
// Uses the anon key but carries the logged-in host's session (from cookies), so
// RLS applies as that host. Use this in Server Components and API routes to read
// the current user and their own rows. NOT privileged — see admin.ts for that.
// =============================================================================

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PUBLIC_ENV } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(PUBLIC_ENV.supabaseUrl, PUBLIC_ENV.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component where cookies can't be set — safe to
          // ignore; the middleware refreshes the session.
        }
      },
    },
  });
}
