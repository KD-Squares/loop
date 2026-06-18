"use client";

// A small speaker toggle. Clicking it is a user gesture, so it also serves to
// "unlock" audio on the page. Shared by the host and player screens.

import { useEffect, useState } from "react";
import { isMuted, toggleMute, onMuteChange } from "@/lib/audio";

export default function MuteButton({ className = "" }: { className?: string }) {
  const [m, setM] = useState(false);

  useEffect(() => {
    setM(isMuted());
    return onMuteChange(() => setM(isMuted()));
  }, []);

  return (
    <button
      type="button"
      onClick={toggleMute}
      aria-label={m ? "Turn sound on" : "Turn sound off"}
      title={m ? "Sound off" : "Sound on"}
      className={`grid h-10 w-10 place-items-center rounded-full bg-white text-lg shadow-card ring-1 ring-line hover:bg-cream ${className}`}
    >
      {m ? "🔇" : "🔊"}
    </button>
  );
}
