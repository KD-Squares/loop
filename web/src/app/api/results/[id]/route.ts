// =============================================================================
// /api/results/[id] — delete one past result (a game_results row).
//
// Ownership is verified with the host's own session (RLS lets a host read only
// their own results). The actual delete uses the service-role client so it works
// even though game_results has no delete policy in the base schema. We only ever
// delete a row after confirming it belongs to the logged-in host.
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // Confirm the result exists and belongs to this host (RLS-scoped read).
  const { data: row } = await supabase
    .from("game_results")
    .select("id, host_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!row || row.host_id !== user.id) {
    return NextResponse.json({ error: "Result not found." }, { status: 404 });
  }

  // Delete with the privileged client (server-only), scoped to this exact id.
  const admin = createAdminClient();
  const { error } = await admin.from("game_results").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
