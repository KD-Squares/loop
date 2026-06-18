"use client";

// AuthForm — handles login, register, and password-reset request in one client
// component. Uses the browser Supabase client (anon key). Shows loading + clear,
// human-readable errors (including the duplicate-email case with helpful links).

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/brand/BrandMark";
import PoweredByNdi from "@/components/brand/PoweredByNdi";
import BlobBg from "@/components/brand/BlobBg";

type Mode = "login" | "register" | "reset";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/dashboard";

  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(redirect);
        router.refresh();
        return;
      }

      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Supabase returns an obfuscated user with empty identities for a
        // duplicate email when confirmations are on — surface a clear message.
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError("DUPLICATE");
          return;
        }
        // If email confirmation is required, there is no session yet.
        if (!data.session) {
          setNotice(
            "Account created. Check your email to confirm, then log in."
          );
          return;
        }
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      // reset
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/login`
            : undefined,
      });
      if (error) throw error;
      setNotice("If that email exists, a password reset link is on its way.");
    } catch (err) {
      const msg = (err as Error).message || "Something went wrong.";
      // Friendly mapping for common cases.
      if (/already registered|already exists/i.test(msg)) setError("DUPLICATE");
      else if (/invalid login credentials/i.test(msg))
        setError("That email or password is incorrect.");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "login" ? "Host sign in" : mode === "register" ? "Create a host account" : "Reset your password";

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-5 py-8 sm:px-6">
      <BlobBg />
      <Link href="/" className="mb-8 flex justify-center">
        <BrandMark size="md" />
      </Link>
      <div className="card">
        <h1 className="mb-4 text-xl font-bold">{title}</h1>

        {error === "DUPLICATE" ? (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
            That email is already registered.{" "}
            <Link href="/login" className="font-semibold underline">
              Log in
            </Link>{" "}
            or{" "}
            <Link href="/reset-password" className="font-semibold underline">
              reset your password
            </Link>
            .
          </div>
        ) : error ? (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        ) : null}

        {notice && (
          <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
            {notice}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode !== "reset" && (
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "login"
              ? "Log in"
              : mode === "register"
              ? "Sign up"
              : "Send reset link"}
          </button>
        </form>

        <div className="mt-4 space-y-1 text-center text-sm text-slate-600">
          {mode === "login" && (
            <>
              <p>
                No account?{" "}
                <Link href="/register" className="font-semibold text-brand underline">
                  Sign up
                </Link>
              </p>
              <p>
                <Link href="/reset-password" className="text-brand underline">
                  Forgot password?
                </Link>
              </p>
            </>
          )}
          {mode === "register" && (
            <p>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-brand underline">
                Log in
              </Link>
            </p>
          )}
          {mode === "reset" && (
            <p>
              <Link href="/login" className="text-brand underline">
                Back to login
              </Link>
            </p>
          )}
        </div>
      </div>
      <div className="relative z-10 mt-6 flex justify-center">
        <PoweredByNdi />
      </div>
    </main>
  );
}
