"use client";

// Host game route. The hostToken + pin arrive as query params from the dashboard
// launch (host-only navigation). If they're missing (e.g. a refresh), we send the
// host back to the library to relaunch — a game can't be re-attached without its
// token.

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import HostGameClient from "./HostGameClient";

function HostGameInner() {
  const params = useParams<{ gameId: string }>();
  const search = useSearchParams();
  const gameId = params.gameId;
  const token = search.get("token") ?? "";
  const pin = search.get("pin") ?? "";

  if (!token || !pin) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="text-slate-600">
          This host session can&apos;t be resumed directly. Launch the game again
          from your library.
        </p>
        <Link href="/dashboard" className="btn-primary mt-4 inline-flex">
          Back to library
        </Link>
      </div>
    );
  }

  return <HostGameClient gameId={gameId} hostToken={token} pin={pin} />;
}

export default function HostGamePage() {
  return (
    <Suspense>
      <HostGameInner />
    </Suspense>
  );
}
