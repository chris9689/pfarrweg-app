# Pfarrweg.APP – shared parking availability

A small, mobile-first web app (PWA) for one residential building: **4 apartments, 8 parking spaces**.
Residents mark when their own spaces are free; everybody sees at a glance which spaces are free **now**,
which become free **soon**, which are **reserved** and which are **occupied**. Other apartments can reserve
a free space (or part of a free period) with their apartment code.

- Public overview without login (German / English, remembered per device)
- One access code per apartment → manage only that apartment's two spaces
- One-off and recurring availability (daily, weekly, selected weekdays, optional end date),
  pause / resume, edit or delete *this date*, *this and following*, or *the whole series*
- Reservations: tap a free space, enter the apartment code once, reserve (whole or part of the free period).
  Reserved time cannot be removed by the owner; only the reserving apartment (or the admin) can cancel.
- Overlaps are refused with a clear explanation
- Status is computed from the schedule and the current time – no background jobs
- Separate, protected admin area: apartments, space assignments, access codes, all schedules, activity history
- Installable PWA with offline indicator and "last updated" notice

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture and data flow.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router, i18next / react-i18next, Luxon, lucide icons |
| API | One Vercel Function (`api/handler.ts`) – Node.js, TypeScript |
| Database | Supabase Postgres (via the `postgres` driver), RLS enabled |
| PWA | vite-plugin-pwa (Workbox) |
| Tests | Vitest (unit + API integration on in-process Postgres via PGlite), Playwright (E2E, mobile + desktop) |

**Why a Vercel Function instead of Supabase Edge Functions / Supabase Auth?**
The recurrence, DST and overlap logic is written once in `shared/` and used by both the browser (display)
and the server (authoritative validation). Keeping the API in the same repository and deployment avoids
duplicating that logic in Deno/SQL and gives a single deploy. Supabase still provides the managed Postgres
database; browsers never talk to it directly (no anon key in the frontend), and RLS denies all access for
Supabase's public roles as defence in depth. Apartment codes do not fit Supabase Auth's user model, so a
small custom session mechanism is used (hashed codes, hashed session tokens, HttpOnly cookies).

---

## Project structure

```
api/handler.ts            Vercel Function entry – routes every /api/* request
server/                   API: routing, auth, sessions, rate limiting, SQL repository, schedule service
shared/                   Domain logic shared by browser and server (recurrence, status, conflicts, validation)
src/                      React app (pages, components, i18n, hooks)
src/i18n/locales/         de.json, en.json
supabase/migrations/      SQL schema + initial building layout
scripts/                  migrate.mjs, hash-password.mjs, generate-icons.mjs
tests/                    Vitest unit + integration tests
e2e/                      Playwright end-to-end tests
public/                   Branding sheet + generated icons (`npm run icons` crops the app icon from the sheet)
```

---

## Deployment (GitHub → Vercel + Supabase)

You do not need to run anything locally to deploy.

### 1. Supabase

1. Create a project at <https://supabase.com> – choose region **Central EU (Frankfurt)**.
2. *Project Settings → Database → Connection string → **Transaction pooler*** (port `6543`). Copy the URI
   and insert your database password. This is your `DATABASE_URL`.

The schema is created automatically on the first Vercel build (see step 3). Alternatively paste the files in
`supabase/migrations/` (in order) into the Supabase SQL editor, or run `supabase db push` – the migrations are
idempotent, so mixing approaches is safe.

### 2. GitHub

Push this repository to GitHub (private repository recommended).

### 3. Vercel

1. *Add New → Project* → import the GitHub repository. The settings come from `vercel.json`
   (framework Vite, build command `npm run vercel-build`, output `dist`, region `fra1`).
2. Add **Environment Variables** (mark secrets as *Sensitive*):

   | Name | Value | Environments |
   |---|---|---|
   | `DATABASE_URL` | Supabase transaction-pooler URI | Production (see note) |
   | `ADMIN_PASSWORD` | a strong password (≥ 12 characters) – **or** `ADMIN_PASSWORD_HASH` (see below) | Production |
   | `BUILDING_NAME` | e.g. `Pfarrweg` (shown in the header) | all |
   | `BUILDING_TIMEZONE` | e.g. `Europe/Berlin` or `Europe/Zurich` (default `Europe/Berlin`) | all |

   Optional: `MIGRATION_DATABASE_URL` – a separate connection (e.g. *Session pooler*) used only for migrations.

   > **Preview deployments:** `vercel-build` runs the migrations against the configured database. Either set
   > `DATABASE_URL` for *Production* only, or use a separate Supabase project for *Preview*.

3. Deploy. The build log shows `[migrate] applied …` on the first run, then `Database is up to date.`

Instead of `ADMIN_PASSWORD` you can store only a hash: run `npm run hash-password -- "your password"` on any
machine with Node.js and set the output as `ADMIN_PASSWORD_HASH` (the hash takes precedence if both are set).

### 4. First-time setup in the app (administrator)

1. Open `https://<your-app>/admin` (also linked at the bottom of the overview) and sign in.
2. **Apartments**: the initial layout is apartments `1`–`4` with spaces 1+2, 3+4, 5+6, 7+8. Rename them if needed
   (e.g. `EG links`) – they are shown as "Apartment …" / "Wohnung …".
3. **Parking spaces**: change the assignments if the real layout differs.
4. Press **Create new access code** for each apartment. The 8-digit code is shown **once** – note it and
   hand it to the residents (e.g. on a card). Codes are stored only as hashes and cannot be displayed again.
5. Residents open the app, choose **My parking spaces**, and enter their code once per device.

---

## Administration guide

| Task | How |
|---|---|
| Add an apartment | Admin → *Apartments* → enter name → *Add apartment*, then assign spaces and create a code |
| Change which apartment owns a space | Admin → *Parking spaces* → choose the apartment. Existing availability for that space stays; only the new apartment can change it from now on |
| Code lost / resident moved out | *Create new access code*. The old code stops working immediately and all devices of that apartment are signed out |
| Remove an apartment | Reassign its spaces first, then delete it |
| Remove or pause someone's availability | Admin → *Availability* → pause / delete |
| See what happened | Admin → *Activity history* (last 200 changes) |
| Change the admin password | Update `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` in Vercel and redeploy |
| Add parking spaces beyond 8 | Insert a row in Supabase: `insert into parking_spaces (space_number) values (9);` then assign it in the admin area |

Admin sessions last 8 hours; resident sessions 180 days (until sign-out or a code reset).

---

## Local development (optional)

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local      # optional: set DEV_ADMIN_PASSWORD for /admin
npm run dev                     # http://localhost:5173
```

`npm run dev` serves the same API handlers from an **in-memory Postgres (PGlite)** with all migrations applied –
no Supabase needed. Apartment codes in dev: `11111111`, `22222222`, `33333333`, `44444444`.
Data is reset when the dev server restarts.

> On OneDrive/synced folders Vite uses file polling (configured). If Vite fails to start because esbuild's
> install script was blocked, run `node node_modules/esbuild/install.js` once.

### Tests

```bash
npm test                 # unit + API integration tests (Vitest, PGlite)
npm run typecheck
npx playwright install chromium && npm run test:e2e     # E2E (mobile + desktop)
# or use an installed browser:  PLAYWRIGHT_CHANNEL=msedge npm run test:e2e
```

Covered: status calculation, recurrence incl. DST (spring/autumn) and midnight crossing, exceptions, overlap
detection, input validation, translation completeness (identical keys, placeholders, no unused keys, no
hard-coded UI text), language detection, apartment-code authentication, rate limiting, session handling,
apartment isolation, admin permissions, public overview data exposure, CSRF checks, and the complete user
journeys in both languages on mobile and desktop.

GitHub Actions (`.github/workflows/ci.yml`) runs type checks, Vitest and Playwright on every push.

---

## Security summary

- Access codes and the admin password are stored as **scrypt hashes**; codes are shown once on creation.
- Sessions: random 256-bit tokens, only their SHA-256 hash is stored; cookies are `HttpOnly`, `Secure`,
  `SameSite=Strict`, path-scoped (`/api`, `/api/admin`).
- Every write checks on the server that the space belongs to the signed-in apartment (other apartments' schedules
  answer `404`). Admin endpoints require a separate admin session.
- Login rate limiting per client (10 failures / 15 min; admin 5) and globally (100 / h; admin 30).
- State-changing requests must be JSON and same-origin (Origin check).
- The public endpoint returns space numbers, time ranges and – for reservations – the reserving apartment's name.
- Database: RLS enabled on all tables with no policies and privileges revoked for `anon`/`authenticated`;
  the connection string lives only in Vercel env vars.
- Strict security headers and CSP (`vercel.json`). The service worker never caches `/api` responses.

## Maintenance

- **Backups**: Supabase takes daily backups (paid plans) – or export via *Database → Backups*.
- **Housekeeping** happens automatically on login (expired sessions, login attempts older than 2 days).
  Old one-off periods remain in the database for the history and are simply not shown.
- **Dependencies**: `npm outdated` / `npm update`, then `npm test` and `npm run test:e2e`.
- **Schema changes**: add a new file in `supabase/migrations/` (timestamp prefix); it runs on the next deploy.

## Future: notifications

Not part of the MVP. All changes already flow through `server/schedules.ts` and are written to
`activity_log`, which is the natural hook for e.g. web-push ("space 3 is free", "your period ends soon").
