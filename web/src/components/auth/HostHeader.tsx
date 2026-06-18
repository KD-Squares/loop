"use client";

// Top bar for the host area: brand, nav, and a working logout button.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/brand/BrandMark";

export default function HostHeader({
  email,
  isAdmin = false,
}: {
  email: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
        pathname.startsWith(href)
          ? "bg-brand text-white"
          : "text-muted hover:bg-cream"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/dashboard">
          <BrandMark size="sm" />
        </Link>
        <nav className="flex items-center gap-1">
          {link("/dashboard", "Library")}
          {link("/results", "Results")}
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Admin
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
          <button onClick={logout} className="btn-secondary px-3 py-1.5 text-sm">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
