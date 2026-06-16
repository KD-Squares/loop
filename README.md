# Loop

A real-time, game-based quiz web app in the spirit of Kahoot — deliberately
simple. Build a quiz once from a PDF, then host it as a live game any number of
times. Up to 100 players join from their own devices with a 6-digit PIN and
answer timed questions scored by speed, while the host watches a live
leaderboard.

> **Two separate activities, by design**
>
> - **Building a quiz** (once, ahead of time): upload a PDF → Loop reuses or
>   generates questions → you review and save it to your library. **A PDF is
>   uploaded ONLY here.**
> - **Playing a game** (any time, repeatedly): open your library, pick a saved
>   quiz, and launch a live game. **No upload at game time.** Each launch is an
>   independent game with its own PIN, players, and results.

---

## Repo structure

```
loop/
  web/        # Next.js app (host + player UI, server API routes)
  server/     # Standalone Socket.IO realtime game server (authoritative)
  supabase/   # SQL migrations + RLS policies
  .env.example
  README.md
```

The realtime server is a **separate process** from Next.js because a live game
needs an always-on, authoritative WebSocket server.

> Implementation note: the round lifecycle and resilience logic live inside the
> `Game` state machine (`server/src/game.ts`) rather than separate files — it is
> one cohesive state machine. `gameManager.ts` handles single-game enforcement,
> PIN minting, and idle cleanup.

---

## Tech stack

| Concern            | Choice                                                |
| ------------------ | ----------------------------------------------------- |
| Web app            | Next.js (App Router) + React + TypeScript + Tailwind  |
| Realtime server    | Node.js + Socket.IO (`/server`)                       |
| DB / Auth / Storage| Supabase (Postgres, Auth email+password, private bucket `pdfs`) |
| PDF text           | `pdf-parse` (server-side)                             |
| Question generation| Anthropic Claude (`claude-sonnet-4-6`), server-side   |

**Security rule:** the Supabase service-role key and the Anthropic key are
**server-only** and never reach the browser.

---

## 1. Prerequisites

- Node.js **18.18+** (or 20+)
- A free [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com/)
- (Optional for local DB) the [Supabase CLI](https://supabase.com/docs/guides/cli)

---

## 2. Create the Supabase project + `pdfs` bucket

You can use **managed Supabase** (recommended) or the **local CLI**.

### Option A — Managed (recommended)

1. Create a new project at <https://supabase.com>.
2. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`
3. Apply the schema. In the **SQL Editor**, run each file in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_storage.sql`

   `0003` creates the private **`pdfs`** bucket and its row-level policies.
4. (Auth) Under **Authentication → Providers → Email**, ensure email/password is
   enabled. For the smoothest first run you may disable "Confirm email" while
   testing.

### Option B — Local CLI

```bash
cd loop
supabase start          # boots local Postgres/Auth/Storage
supabase db reset       # applies everything in supabase/migrations + seed.sql
```

The local API URL and keys are printed by `supabase start`.

---

## 3. Set environment variables

Copy the example files and fill in your values. Every variable is documented in
[`.env.example`](./.env.example).

```bash
# Web
cp .env.example web/.env.local        # then edit web/.env.local

# Server
cp .env.example server/.env           # then edit server/.env
```

Minimum to run locally:

**`web/.env.local`**
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
SOCKET_SERVER_INTERNAL_URL=http://localhost:4000
```

**`server/.env`**
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
PORT=4000
WEB_ORIGIN=http://localhost:3000
MAX_PLAYERS=100
HOST_GRACE_SECONDS=90
GAME_IDLE_TIMEOUT_SECONDS=1800
```

> The service-role key doubles as the shared secret the web `/api/games` route
> uses to authenticate its server-to-server call to the realtime server's
> internal launch endpoint. Keep both in sync.

---

## 4. Install & run locally

From the repo root (npm workspaces):

```bash
npm install            # installs web + server
npm run dev            # runs BOTH: Next.js on :3000 and the server on :4000
```

Or run them separately:

```bash
npm run dev:web        # http://localhost:3000
npm run dev:server     # http://localhost:4000  (GET /health to check)
```

### Try it end to end

1. Open <http://localhost:3000> → **Host sign in** → create an account.
2. **Create quiz**: title, number of questions, seconds per question, and a PDF
   (≤10 MB). Loop extracts text and either reuses an embedded question bank or
   generates questions with Claude.
3. **Review**: fix/flag/add questions, then **Save & mark ready**.
4. On the dashboard, click **Host game** → a lobby opens with a 6-digit PIN.
5. On a phone (or another browser tab) open **Join a game**, enter the PIN and a
   nickname.
6. Press **Start**, then drive the game with **Next / Skip / End**.

---

## 5. Deploy

### Web → Vercel

1. Import the repo; set the **Root Directory** to `web/`.
2. Add the env vars from `web/.env.local` to the Vercel project.
3. Set `NEXT_PUBLIC_SOCKET_URL` and `SOCKET_SERVER_INTERNAL_URL` to your
   deployed realtime server URL.
4. Deploy.

### Realtime server → Railway / Render

1. New service from the repo; **Root Directory** `server/`.
2. Build: `npm install && npm run build`. Start: `npm start`.
3. Env vars from `server/.env`. Set `WEB_ORIGIN` to your Vercel URL.
4. Deploy, then point the web app's `NEXT_PUBLIC_SOCKET_URL` /
   `SOCKET_SERVER_INTERNAL_URL` at this service.

### Supabase → managed

Already managed if you used Option A. Run the three migrations against the
production project via the SQL Editor.

---

## Scoring (authoritative, server-side)

Implemented in `server/src/scoring.ts` (mirrored for UI preview only in
`web/src/lib/scoring.ts`):

```
points = 10 * (1 - (timeTakenMs / timeLimitMs) * 0.5)   // correct answers
       = 0                                               // wrong / no answer
```

- Instant correct ≈ **10.0**, buzzer-beater ≈ **5.0**, continuous in between.
- Rounded to **1 decimal place** for display and ranking.
- **Timing is server-authoritative** — a client timestamp is accepted only as a
  hint and is never trusted for scoring.
- **Ranking:** higher cumulative score first; tie-break by lower total response
  time; if still equal, players **share** the rank.

---

## Resilience & guarantees

- **Player reconnect** keeps score; rejoining with the same nickname/token
  resumes at the current round. Locked rounds can't be answered.
- **Host disconnect** pauses the game (timers hold). Returns within
  `HOST_GRACE_SECONDS` → resume; otherwise it ends cleanly and saves results.
- **Single game per deployment** is enforced by the realtime server; a stale
  game auto-closes after `GAME_IDLE_TIMEOUT_SECONDS` so the slot is never locked.
- **Capacity** is capped at `MAX_PLAYERS`; **late joins** after Start are refused.
- **Crash safety:** the in-memory game is the source of truth; it checkpoints to
  Postgres at player join, end of each round, and end of game — so a crash loses
  at most the current round.
- **Deleting a quiz never deletes results** — `game_results` is decoupled and
  stores a title snapshot.

---

## Where the keys go (recap)

| Key                         | Side        | Used by                                  |
| --------------------------- | ----------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_*`    | browser ok  | client auth, public reads                |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | `/api` routes, realtime checkpoints      |
| `ANTHROPIC_API_KEY`         | server only | `/api/generate` question generation      |
| `NEXT_PUBLIC_SOCKET_URL`    | browser ok  | host/player socket connection            |

Look for `// TODO: paste your own ...` markers in the `.env` files.
