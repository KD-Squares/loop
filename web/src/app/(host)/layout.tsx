// Host area layout. The middleware already guarantees an authenticated user on
// these routes; here we just load the email for the header.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HostHeader from "@/components/auth/HostHeader";
import PoweredByNdi from "@/components/brand/PoweredByNdi";

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
    <div className="flex min-h-screen flex-col">
      <HostHeader email={user.email ?? ""} />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</div>
      <footer className="mt-auto flex justify-center border-t border-line bg-white py-4">
        <PoweredByNdi />
      </footer>
    </div>
  );
}
