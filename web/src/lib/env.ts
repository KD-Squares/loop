// =============================================================================
// env.ts — typed environment access with fail-fast for server secrets.
//
// Browser-safe values use the NEXT_PUBLIC_ prefix. Server-only secrets are read
// lazily inside server code paths and throw if missing, so a misconfigured
// deployment fails loudly instead of silently misbehaving.
// =============================================================================

export const PUBLIC_ENV = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000",
};

/** Server-only. Throws if a required secret is missing. */
export function serverEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const socketInternalUrl =
    process.env.SOCKET_SERVER_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_SOCKET_URL ??
    "http://localhost:4000";

  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return {
    supabaseUrl,
    serviceRoleKey,
    anthropicKey: anthropicKey ?? "",
    socketInternalUrl,
  };
}
