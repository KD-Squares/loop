// Admin area layout. requireAdmin() redirects anyone who is not a configured
// admin, so every page under /admin is protected.

import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import AdminNav from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-display rounded-lg bg-ink px-2.5 py-1 text-sm font-bold text-white">
              Admin
            </span>
            <AdminNav />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{user.email}</span>
            <Link href="/dashboard" className="btn-secondary px-3 py-1.5 text-sm">
              Exit admin
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>
    </div>
  );
}
