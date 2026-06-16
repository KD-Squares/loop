"use client";

// Countdown — a purely visual, client-side timer. Display only: the realtime
// server is authoritative for when a round actually locks. This just counts down
// from the configured limit for player/host feedback.

import { useEffect, useState } from "react";

export default function Countdown({
  seconds,
  roundId,
  size = "md",
}: {
  seconds: number;
  roundId: string; // restart the timer whenever the round changes
  size?: "sm" | "md" | "lg";
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, seconds - elapsed);
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [seconds, roundId]);

  const dim = size === "lg" ? "h-24 w-24 text-4xl" : size === "sm" ? "h-12 w-12 text-lg" : "h-16 w-16 text-2xl";

  return (
    <div
      className={`flex ${dim} items-center justify-center rounded-full font-black text-white ${
        remaining <= 5 ? "bg-tile-red" : "bg-brand"
      }`}
    >
      {Math.ceil(remaining)}
    </div>
  );
}
