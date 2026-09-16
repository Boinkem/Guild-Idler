# Guildbound AH server

Backend for the Auction House. Standalone Node/TypeScript service, meant to
be self-hosted -- **not** part of the Electron client and not built or
packaged by anything in the repo root (`npm run build`/`npm run package`
never touch this folder; see root `tsconfig.json`'s `include`, which
doesn't list `server/`).

Full design, decisions, and build order live in `../guild-idler-status.md`
under the Auction House entry. This is step 2 of that build order --
backend skeleton -- deliberately scaffolded to do nothing real yet.

## Why "deliberately inert"

This skeleton exists to prove the deploy plumbing (DNS, TLS, the Windows
Service, the firewall chain) works before any real Auction House logic
sits behind it, and to give a safe starting point to deploy from before
Postgres or DNS are actually ready. Three independent layers keep it
harmless until you mean to turn it on:

1. **The Windows Service isn't installed automatically.**
   `scripts/install-windows-service.ps1` is a manual step you run
   yourself, and even then it does not start the service -- see that
   script's own output.
2. **`AH_ENABLED` defaults to `false`**, in code (`src/config.ts`), not
   just in `.env.example` -- a missing `.env`, a missing line, or a typo
   all fail safe to disabled.
3. **Every route except `/health` 503s while disabled** (`src/index.ts`'s
   `onRequest` hook). `/health` itself still reports
   `{ ahEnabled: false, mode: "offline" }` so you can confirm the deploy
   plumbing works without exposing anything else.

## Local dev

```
cd server
npm install
cp .env.example .env
npm run dev
```

`GET http://localhost:4000/health` should return
`{"status":"ok","ahEnabled":false,"mode":"offline"}`.

## Deploying

1. `npm run build` (compiles to `dist/`).
2. Confirm `.env` is set up on the host (`AH_ENABLED=false` is fine and
   expected at this stage).
3. `scripts/install-windows-service.ps1` -- see that script's own header
   for prerequisites. Does not start the service.
4. Once DNS/TLS/Postgres are all actually confirmed, start the service
   and only then consider flipping `AH_ENABLED=true` -- and only once
   there's real logic behind it worth turning on.

## Not verified

No real Windows machine, Postgres instance, or live domain in this dev
environment -- `npm install`/`npm run build`/`npm run dev` have not been
run for real here. Worth a real pass through all of the above on the
actual host before trusting any of it.
