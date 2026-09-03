# C-019 — PARTIAL evidence, local PostgreSQL verified

Date: 2026-09-03. Builder verification; planner rerun and hosted gate remain separate.

- `postgres.log`: 11 real PostgreSQL integration tests pass, 0 skipped. PostgreSQL 16.14, disposable local `sharefridge_test` database. Runs migration twice while preserving legacy UUID/password hash/timestamp; uses two independent child Node API processes; verifies cross-process persistence, unique room creation, ownership checks, ten racing consumes creating one shopping row, transaction rollback, shared five-failure rate limit, cold-process retention of food/history/shopping/subscriptions, and nonowner RLS. Production weak/missing session secrets fail without a room insertion. Readiness fails for missing migration/column/configuration.
- `unit.log`: 32 tests pass, 0 skipped. Existing API/security tests now explicitly inject the empty test adapter; runtime seeds and RAM fallback removed. Vercel rewrite assertion proves `/readyz` maps to `/api` before the SPA fallback and is excluded from that fallback.
- `build.log`: `npm run build` succeeds, TypeScript + Vite (1845 modules).

Reproduction, after supplying disposable `TEST_DATABASE_URL` through the environment:

```sh
npm run test:postgres
GEMINI_API_KEY= node --test --test-timeout=15000 tests/*.test.js
npm run build
```

Schema/migration CLI: `supabase/schema.sql`, `npm run db:migrate` using `DATABASE_URL`. It preserves existing rows and is repeatable. Tests do not reset/drop the database; only test-owned rows/roles/triggers are removed.

## Hosted gate still blocked

The linked Vercel project does not currently have `DATABASE_URL`. No hosted DB insertion/read/redeploy persistence proof is claimed. This build intentionally returns 503 readiness/data-service unavailable when deployed without that configuration. `/healthz` and `/api/openapi.json` remain available; `/readyz` is in the spec and host routing. C-019 stays `todo` until the planner supplies hosted evidence. Provider credentials were not exported. No production deployment or data reset was performed by the builder.
