// =============================================================================
// supabase/client.ts — browser Supabase client (anon key ONLY).
//
// Safe to import in client components. Never holds privileged keys.
// =============================================================================

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { PUBLIC_ENV } from "@/lib/env";

export function createClient() {
  return createBrowserClient(PUBLIC_ENV.supabaseUrl, PUBLIC_ENV.supabaseAnonKey);
}
