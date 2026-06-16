"use client";

// Top bar for the host area: brand, nav, and a working logout button.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function HostHeader({ email }: { email: string }) {
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
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        pathname.startsWith(href)
          ? "bg-brand text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="text-xl font-black text-brand">
          Loop
        </Link>
        <nav className="flex items-center gap-1">
          {link("/dashboard", "Library")}
          {link("/results", "Results")}
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
