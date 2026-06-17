// PoweredByNdi — a "Powered by" line followed by the real NDI logo image.
// Used site-wide (landing, auth, player, host footer). The logo lives at
// web/public/ndi-logo-full.png and is shown inline next to the words.

export default function PoweredByNdi({
  variant = "light",
  className = "",
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const text = variant === "dark" ? "text-white/80" : "text-muted";
  return (
    <div className={`inline-flex items-center gap-2 ${text} ${className}`}>
      <span className="text-xs font-semibold">Powered by</span>
      {/* The wide NDI wordmark; sized by height so it sits neatly inline. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/ndi-logo-full.png"
        alt="NDI logo"
        className="h-5 w-auto sm:h-6"
      />
    </div>
  );
}
