// Landing page: routes hosts to their dashboard (or login) and players to join.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 text-center">
      <div>
        <h1 className="text-6xl font-black tracking-tight text-brand">Loop</h1>
        <p className="mt-3 text-lg text-slate-600">
          Build a quiz once. Play it live, any time, with up to 100 players.
        </p>
      </div>

      <div className="grid w-full max-w-md gap-4">
        <Link href="/play" className="btn-primary py-4 text-lg">
          Join a game
        </Link>
        {user ? (
          <Link href="/dashboard" className="btn-secondary py-4 text-lg">
            Go to my dashboard
          </Link>
        ) : (
          <Link href="/login" className="btn-secondary py-4 text-lg">
            Host sign in
          </Link>
        )}
      </div>

      <p className="text-sm text-slate-500">
        Players join with a 6-digit PIN — no account needed.
      </p>
    </main>
  );
}
