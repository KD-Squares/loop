// =============================================================================
// supabase/admin.ts — PRIVILEGED service-role client. SERVER ONLY.
//
// This bypasses Row Level Security. It must NEVER be imported into a client
// component. It is only used inside /api routes for privileged operations such
// as reading a quiz's full question set to launch a game, or signed-URL uploads.
//
// The "server-only" import below makes the build fail if this file is ever
// pulled into a client bundle.
// =============================================================================

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

export function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = serverEnv();
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
