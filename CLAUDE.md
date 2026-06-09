# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AI 骑行助手 — a self-hosted cycling analytics platform built with Next.js 15 App Router. Integrates with intervals.icu and Strava for training data, provides AI-powered ride analysis, power profiling, segment tracking, race planning, and a CopilotKit-driven assistant sidebar.

## Commands

```bash
npm run dev              # Start dev server (port 3000)
npm run build            # Production build
npm run test             # Run all tests (vitest)
npm run test -- tests/cycling-levels.test.ts  # Single test file
npm run test:watch       # Watch mode
npm run prisma:generate  # Regenerate Prisma client after schema changes
npm run db:push          # Push schema to SQLite (no migration files)
```

Before first run: `DATABASE_URL="file:./data/app.db" npx prisma db push`

## Architecture

**Stack**: Next.js 15.5.4, React 19, TypeScript strict, Prisma 6 + SQLite, CopilotKit v1.59, Vitest

**Route groups**:
- `app/(analytics)/` — authenticated analytics pages (power curve, PMC, segments, levels, fatigue, race plans)
- `app/api/` — REST endpoints; no tRPC

**Key directories**:
- `lib/engine/` — pure computation (power curve, PMC/CTL/ATL, FTP estimation, recovery scoring, segment analysis, level progression). Unit-tested, no DB access.
- `lib/assistant/` — CopilotKit integration: `system-prompt.ts` (builds prompt from user profile), `context-builder.ts` (fetches training summary), `llm-chat.ts` (reads AI config from DB)
- `lib/intervals.ts` + `lib/strava.ts` — external API clients
- `components/analytics/` — Recharts-based visualization components (lazy-loaded)

**Data flow**:
1. Strava webhook or intervals.icu sync → `SyncJob` queue → Activity created with `rawSummaryJson` + `rawStreamsJson`
2. Engine functions compute derived metrics (TSS, power curve, PMC) from raw data
3. AI reports generated on-demand via OpenAI-compatible API (config stored encrypted in `AppConfig` table)

**AI system**:
- Runtime endpoint: `/api/copilotkit` — creates `CopilotRuntime` with `OpenAIAdapter`, reading API key/model/baseURL from DB each request
- All API keys encrypted with AES-256-GCM (`lib/crypto.ts`) using `APP_SECRET` env var
- `normalizeBaseUrlForSdk()` strips `/chat/completions` suffix for OpenAI SDK compatibility

**Auth**: Cookie-based sessions (14-day TTL), invite-only or open registration (configurable). No external auth provider.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | SQLite path, e.g. `file:./data/app.db` |
| `APP_SECRET` | Prod only | AES encryption key for API keys in DB |
| `APP_PORT` | No | Override default 3000 |

No `.env` file committed — sensitive config lives in the `AppConfig` DB table (encrypted).

## Conventions

- Chinese UI strings throughout (labels, error messages, types like `"轻松骑"`)
- `lib/types.ts` is the canonical type source; Prisma schema mirrors it but JSON fields are stored as strings in DB
- Path alias: `@/*` → project root
- IDs generated via `createId(prefix)` in `lib/storage.ts` (nanoid-based)
- Commit messages: conventional-commit style with Chinese summary

## Testing

Tests live in `tests/` and cover `lib/engine/` logic only (pure functions). No API/integration tests exist. Coverage targets `lib/engine/**/*.ts`.

```bash
npm run test                    # all
npx vitest run tests/smoke.test.ts   # one file
```
