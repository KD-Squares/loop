"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PlayerClient from "@/components/player/PlayerClient";

function PlayInner() {
  const search = useSearchParams();
  const pin = (search.get("pin") ?? "").replace(/\D/g, "").slice(0, 6);
  return <PlayerClient initialPin={pin} />;
}

export default function PlayPage() {
  return (
    <Suspense>
      <PlayInner />
    </Suspense>
  );
}
