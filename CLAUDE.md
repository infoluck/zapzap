# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ZapZap ("WhatsApp Connect & Disparos") is a multi-tenant WhatsApp CRM and bulk-sender: chat view, contact profiles/segmentation, Spintax templates, bulk campaigns with an anti-ban engine, and campaign history. UI text, comments and docs are in Brazilian Portuguese — keep that convention. `DOCUMENTATION.md` is the detailed handoff doc (design system colors, DB schema, anti-ban engine, Evolution endpoints); consult it for UI color/class conventions.

## Commands

- `npm run dev` — runs `tsx server.ts`: Express on `PORT` (default 3000; `.env.example` uses 3001) with Vite mounted as middleware (single process serves API + SPA with HMR).
- `npm run lint` — `tsc --noEmit`. This is the only check; there is no test suite. Run it after changes.
- `npm run build` — `prisma generate` + `vite build` + esbuild bundle of `server.ts` to `dist/server.cjs`. `npm start` runs the bundle.
- `npm run db:migrate` — `prisma migrate dev` (guarded: localhost only).
- `npm run db:deploy` / `db:studio` — `prisma migrate deploy` / Prisma Studio (guarded).
- `npm run db:export` → `deploy/zapzap-data.local.json`; `npm run db:import -- <file>` is insert-only and idempotent.
- `npm run start:prod` — what the Docker container runs: db-guard → `prisma migrate deploy` → server.
- Deploy (Easypanel, same flow as rcloud/menuluck): only `main` is deployed. Each push to `main` runs `.github/workflows/docker-release.yml`: lint → push `infoluck/image:zapzap-latest` + `zapzap-<VERSION>` → POST the Easypanel webhook (`vars.DEPLOY_PROD_URL`). Manual equivalent: `.\build.ps1 -Release -Deploy` (webhook URL from local `.env`). Production env template: `node scripts/make-deploy-files.cjs` → `deploy/` (gitignored).

Config comes from `.env` (see `.env.example`): `DATABASE_URL`, `APP_URL`, `JWT_SECRET`, `SMTP_*`, `ADMIN_EMAILS` (optional: `EVOLUTION_TRUSTED_HOSTS` for specific internal hosts, `ALLOW_PRIVATE_EVOLUTION_HOSTS` for all). There are no Evolution variables: each user saves their own connection in the app. Without `SMTP_HOST`, dev prints the email-verification link to the server console.

## Database safety (production Postgres is shared with other databases)

- `scripts/db-guard.mjs` refuses any DB not named `zapzap`, the `postgres`/superuser account on a remote host, and remote URLs without `connection_limit`. Don't bypass it by calling `prisma` directly.
- Against a remote server only `prisma migrate deploy` is allowed. Never run `migrate reset`, `db push` or `migrate dev` against it.
- `deploy/` and `.env*` hold secrets and are git/docker-ignored (`scripts/make-deploy-files.cjs` generates them once).

## Architecture

**Backend** (`server.ts` + `src/server/`): one Express app.
- `src/server/auth.ts` — register / verify email / login. JWT in an httpOnly cookie, bcrypt passwords. `requireAuth` is mounted on all of `/api`, except `/api/auth/*` and `/api/health`.
- Multi-tenancy: every data table has `user_id` and a composite PK `(user_id, id)` (`prisma/schema.prisma`). Every route in `server.ts` must filter by `uid(req)`. New users start with no data. Legacy rows with `user_id = ''` go to the admin on their first login.
- `src/server/evolution.ts` — Evolution API connection **per user**: the user saves server URL, instance name and API key in the Conexão screen (`ConnectionSettings.tsx`); stored in `app_settings` (`whatsapp_connection`) with the key AES-256-GCM encrypted (`secretBox.ts`). New accounts start blank. `POST /api/whatsapp-proxy` takes only a path from the browser; the server injects the user's saved host and key, ignores any client-supplied apikey/host/headers, uses `redirect: 'manual'`, blocks `/instance/create|all|delete`, and refuses private/loopback hosts (SSRF guard `assertPublicHost`; exceptions only via `EVOLUTION_TRUSTED_HOSTS`). Network failures go through `describeFetchError` so the UI shows the real cause (Node's `fetch failed` hides it in `err.cause`). The key is never returned in full.
- `src/server/admin.ts` — admin users = `ADMIN_EMAILS`; they get the Administração tab (`AdminView.tsx`).
- Prisma client singleton: `getDb()` in `src/db/index.ts`.
- The `whatsappProxyPlugin` in `vite.config.ts` is a legacy unauthenticated proxy. In dev, the Express route registered before the Vite middleware handles the request instead.

**Frontend** (`src/`): React 19 + Tailwind v4, with no router. `App.tsx` holds all global state and switches tabs (rendered via `Header.tsx`). It renders only after login, and any 401 returns to `AuthView`.
- Persistence: PostgreSQL is the source of truth and LocalStorage (`src/lib/storage.ts`) is only a cache. On startup, App loads everything from the API and **replaces** the cache, even when the result is empty. On every change, App runs `diffById(prev, next)` and sends only the changed items (batch upsert) plus removed ids (`POST /api/<entity>/delete`). Never resend whole lists, and never make `storage.ts` re-create sample data (deleted items came back that way). The cache is cleared on logout or user switch.
- `src/lib/apiClient.ts` — typed fetch wrapper for the backend routes.
- `src/lib/whatsappGateway.ts` — provider abstraction (`evolution` via the proxy, `zapi`, `custom_rest`, `simulator`). It handles several Evolution/Evolution-Go/Wuzapi response shapes.
- `src/lib/antiBanEngine.ts` — recursive Spintax, variable substitution (`{nome}`, `{primeiro_nome}`, `{saudacao}`, `{perfil}`, `{protocolo}`, `{data}`, `{telefone}`), zero-width-char noise, random delays, batch pauses and template rotation.

## Rules learned the hard way

- Never call `POST /instance/connect` from a `setInterval` or an auto-running `useEffect`. It exhausted the Evolution server's Postgres pool (`SQLSTATE 53300`). Poll with `GET /instance/status` and call connect only when the user clicks.
- Never put keys, phone numbers or real contacts in `src/`. Frontend JS is public.
- Styling uses Tailwind classes only. Use inline `style` only for dynamic values such as a profile's hex color.
