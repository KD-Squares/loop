// Host area layout. The middleware already guarantees an authenticated user on
// these routes; here we just load the email for the header.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HostHeader from "@/components/auth/HostHeader";

export default async function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <HostHeader email={user.email ?? ""} />
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
