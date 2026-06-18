// Landing page: routes hosts to their dashboard (or login) and players to join.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BrandMark from "@/components/brand/BrandMark";
import PoweredByNdi from "@/components/brand/PoweredByNdi";
import BlobBg from "@/components/brand/BlobBg";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10 text-center">
      <BlobBg />

      <div className="flex flex-col items-center gap-7 sm:gap-8">
        <BrandMark size="lg" />

        <div>
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Learning never ends.
            <br />
            Keep it looping.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted">
            Loop turns your lesson into a live quiz the whole class plays from
            their phones, so every topic comes back around as a game.
          </p>
        </div>

        <div className="grid w-full max-w-md gap-3">
          <Link href="/play" className="btn-primary py-4 text-lg">
            🎮 Join a game
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

        <PoweredByNdi className="mt-2" />
      </div>
    </main>
  );
}
