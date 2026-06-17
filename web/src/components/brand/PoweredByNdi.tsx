"use client";

// PoweredByNdi — a "Powered by NDI" badge shown across the app.
//
// It uses the REAL NDI logo from /public/ndi-logo.png. If that file isn't present
// yet, it gracefully falls back to a drawn inline mark so nothing ever looks
// broken. Drop your logo at web/public/ndi-logo.png and it appears everywhere.

import { useState } from "react";

function NdiFallbackMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="12" fill="#0B2A45" />
      <path d="M24 11 L35 31 H13 Z" fill="#1FA971" />
      <path d="M24 11 L24 31 H13 Z" fill="#2F6BFF" opacity="0.9" />
      <path d="M24 20 L30 31 H18 Z" fill="#FF6B5E" />
      <circle cx="24" cy="36.5" r="2.2" fill="#FFE2A8" />
    </svg>
  );
}

export default function PoweredByNdi({
  variant = "light",
  className = "",
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const text = variant === "dark" ? "text-white/80" : "text-muted";

  return (
    <div
      className={`inline-flex items-center gap-2 ${text} ${className}`}
      title="Powered by Niger Delta Innovates"
    >
      <span className="text-xs font-semibold">Powered by</span>
      {imgFailed ? (
        <>
          <NdiFallbackMark />
          <span className="font-display text-sm font-bold tracking-wide">NDI</span>
        </>
      ) : (
        // The real logo. Height-constrained; width auto so any aspect ratio fits.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/ndi-logo.png"
          alt="NDI — Niger Delta Innovates"
          className="h-7 w-auto"
          onError={() => setImgFailed(true)}
        />
      )}
    </div>
  );
}
