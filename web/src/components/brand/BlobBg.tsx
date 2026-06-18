// BlobBg — decorative background shapes rendered in a FIXED, behind-content
// layer that never captures taps and never adds to page height. This keeps the
// playful look without clipping or blocking the real content on small screens.
export default function BlobBg() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="blob -right-24 -top-28 h-72 w-72 bg-sun sm:h-80 sm:w-80" />
      <div className="blob -bottom-28 -left-24 h-64 w-64 bg-blush sm:h-72 sm:w-72" />
    </div>
  );
}
