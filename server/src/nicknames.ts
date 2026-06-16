// =============================================================================
// nicknames.ts — validation, a basic profanity filter, and duplicate
// disambiguation so no two identical names ever show in one game.
// =============================================================================

// Deliberately small, conservative list. v1 only needs a "basic filter".
const BANNED = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "asshole",
  "dick",
  "pussy",
  "retard",
  "rape",
];

export interface NicknameCheck {
  ok: boolean;
  error?: string;
}

/** Validate raw user input: 1–20 chars after trim, not blank, not offensive. */
export function validateNickname(raw: string): NicknameCheck {
  const name = (raw ?? "").trim();
  if (name.length === 0) return { ok: false, error: "Please enter a nickname." };
  if (name.length > 20)
    return { ok: false, error: "Nicknames must be 20 characters or fewer." };

  const lower = name.toLowerCase();
  const collapsed = lower.replace(/[^a-z]/g, ""); // catch l33t-ish spacing
  if (BANNED.some((w) => lower.includes(w) || collapsed.includes(w))) {
    return { ok: false, error: "Please choose a different nickname." };
  }
  return { ok: true };
}

/**
 * Ensure uniqueness within a game. If `desired` is already taken, append the
 * smallest trailing number that frees it up (Sam -> Sam2 -> Sam3 ...).
 * `taken` is the set of nicknames already present (case-insensitive compare).
 */
export function disambiguate(desired: string, taken: Set<string>): string {
  const base = desired.trim();
  const lowerTaken = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lowerTaken.has(base.toLowerCase())) return base;

  let n = 2;
  // Keep within 20 chars by trimming the base if needed.
  while (true) {
    const suffix = String(n);
    const room = 20 - suffix.length;
    const candidate = base.slice(0, Math.max(1, room)) + suffix;
    if (!lowerTaken.has(candidate.toLowerCase())) return candidate;
    n++;
  }
}
