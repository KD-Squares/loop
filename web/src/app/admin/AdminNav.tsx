"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/quizzes", label: "Quizzes" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/results", label: "Results" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <nav className="flex flex-wrap gap-1">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            isActive(l.href) ? "bg-ink text-white" : "text-muted hover:bg-cream"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
