# C-024 evidence — 2026-09-03

Session context: implementation (server/push.js, server/pushRepository.js, supabase/push.sql,
src/services/pushClient.ts, public/sw-push.js) was already written on this branch before this
session and had never been committed, wired into the frontend, or tested. This session:

1. Fixed a real bug in `supabase/push.sql`: `queue_push_event()` declared a PL/pgSQL variable
   named `event_id`, which is also a column on its own `push_deliveries` target table. Postgres
   raised `42702 column reference "event_id" is ambiguous` on every roommate-change trigger fire
   (any food/shopping insert/update/delete once a subscriber exists) — confirmed via
   `tests/postgres.integration.js` before the fix (see git history; the failure and root cause
   are not preserved as a separate log to avoid re-running the buggy migration on a real DB).
   Fixed by renaming the variable to `new_event_id`.
2. Wired `NotificationModal.tsx` to the already-written `pushClient` (real `PushManager`
   subscribe/unsubscribe via `useSyncExternalStore`) instead of the previous mock endpoint/keys.
3. Wired `App.tsx` to call `pushClient.setSession(...)` on every session/token change, so a room
   switch or logout runs the existing device-cleanup/unsubscribe logic in `pushClient.ts`.
4. Integrated `public/sw-push.js` into the actual generated PWA service worker via
   `vite-plugin-pwa`'s `workbox.importScripts` option (`vite.config.ts`) — previously the file
   existed but was never loaded by the active worker. Confirmed in the build output
   (`sw-import.log`).
5. Added `VAPID_*`/`CRON_SECRET` to `.env.example`, a `crons` entry to `vercel.json` (09:30 UTC =
   16:30 Asia/Ho_Chi_Minh, matching `flow/05-contract.md`), and a C-024 section to
   `DEPLOY_GUIDE.md`.
6. Fixed two pre-existing `tests/client_contract.test.js` cases that assumed the old mock/stub
   behavior (arbitrary non-provider endpoint + non-cryptographic keys; `/api/notifications/*`
   returning 503) and added real crypto-shaped fixtures and coverage for the new
   `INVALID_SUBSCRIPTION` provider-allowlist/on-curve checks.
7. Fixed `tests/postgres.integration.js`'s subscription fixture (same stale mock-key problem)
   and gave `tests/postgres-worker.js` an injected no-op-but-enabled push integration, so the
   C-019 persistence suite exercises real subscribe/persist behavior without making live network
   calls to a real push provider on every food/shopping mutation in that file.
8. Added `tests/push.test.js` (16 cases): subscription/endpoint/key validation, VAPID pairing,
   cron bearer auth, the Asia/Ho_Chi_Minh 16:30 cutoff and calendar-day boundary, private/loopback
   address rejection, response-size bounding, accepted/expired/retryable dispatch outcomes against
   a fake repository + fake transport, cron dedup gating, and the actual `public/sw-push.js`
   source executed inside a simulated `ServiceWorkerGlobalScope` (push → `showNotification` with
   the right payload/icons, ignoring data-less pushes; `notificationclick` → focus-or-open +
   always-close).

## What is verified (local, reproducible)

- [Unit/contract tests: 89 passed, 0 failed](unit-tests.log) — `npm test`.
- [Production build: exit 0, PWA worker generated](build.log) — `npm run build`.
- [`dist/sw.js` embeds the push handler](sw-import.log) — confirms Verify item 2's build half.
- [PostgreSQL integration: 11 passed, 0 failed](postgres.log) — `npm run test:postgres` against a
  disposable local database (migration run twice, cross-process subscription persistence, cold
  restart, RLS, rate limiting). Reproduce with a disposable local Postgres:
  `createdb sharefridge_c024_test && TEST_DATABASE_URL=postgresql://$(whoami)@localhost:5432/sharefridge_c024_test npm run test:postgres`.
- `npm run test:client-postgres`, `npm run test:sync-postgres`, `npm run test:ai-postgres` all
  still pass unchanged against the same database (checked this session; logs not separately
  archived since they exercise C-019/C-021/C-023, not C-024, and were only a regression check).

## What is NOT verified (needs live access this session does not have)

- Verify item 2's runtime half ("verify push/notificationclick handlers execute") is proven only
  inside a simulated worker global (`tests/push.test.js`), not inside an actual browser/service
  worker. "Rejected subscribe never reports enabled" is proven at the `pushClient.ts` state-machine
  level by code and by the server-side rejection tests, not by a real failed-permission browser run.
- Verify item 3 (an actual notification received on a locked/closed-app device from the deployed
  scheduler) requires a real `VAPID_*`/`CRON_SECRET`-configured Production deployment and a
  physical device; neither is available in this session. No production promotion was made.
- No real Vercel Cron invocation was observed; `vercel.json`'s `crons` entry and the
  `authorizeCron`/`Bearer $CRON_SECRET` convention are documented and unit-tested but unverified
  against a live Vercel cron trigger.

Card stays `status: todo` per this project's evidence rule: local tests are PARTIAL evidence only.
