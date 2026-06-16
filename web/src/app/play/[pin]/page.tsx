"use client";

// Convenience route: /play/123456 pre-fills the PIN, then uses the same player
// client as /play.

import { useParams } from "next/navigation";
import PlayerClient from "@/components/player/PlayerClient";

export default function PlayWithPinPage() {
  const params = useParams<{ pin: string }>();
  const pin = (params.pin ?? "").replace(/\D/g, "").slice(0, 6);
  return <PlayerClient initialPin={pin} />;
}
