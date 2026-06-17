// BrandMark — the Loop logo: a coral, slightly-tilted rounded square with an "L"
// and a chunky 3D shadow, optionally followed by the "Loop" wordmark.
// Matches the cover mark in the design doc.

export default function BrandMark({
  size = "md",
  withWordmark = true,
}: {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
}) {
  const mark =
    size === "lg" ? "h-16 w-16 text-4xl" : size === "sm" ? "h-9 w-9 text-xl" : "h-11 w-11 text-2xl";
  const word =
    size === "lg" ? "text-4xl" : size === "sm" ? "text-xl" : "text-2xl";

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className={`font-display grid place-items-center rounded-2xl bg-brand font-bold text-white ${mark}`}
        style={{ boxShadow: "0 5px 0 #E0493D", transform: "rotate(-6deg)" }}
        aria-hidden
      >
        L
      </span>
      {withWordmark && (
        <span className={`font-display font-bold tracking-tight text-ink ${word}`}>
          Loop
        </span>
      )}
    </span>
  );
}
