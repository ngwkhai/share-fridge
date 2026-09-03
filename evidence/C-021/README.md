# C-021 — PARTIAL local verification, 2026-09-03

Implemented: authoritative whole-room snapshots (including empty active/history/shopping), no cache POST replay, stable cached IDs/absolute expiry, session/request generations for reads/queued writes/post-write refresh/callbacks, 401 invalidation, 403 session preservation, explicit initial-loading and stale/offline/reconnecting/periodic/connected UI. Local writes wait for server success; no outbox.

Database migration adds room_sync_versions and owner-only fixed-search-path triggers; revision changes roll back with the original transaction. RLS permits SELECT for a signed matching room claim and denies client writes/trigger execution. The app's raw food/shopping publication entries are replaced with revision INSERT/UPDATE. Readiness refuses missing migration/publication, raw publication membership and FOR ALL TABLES.

Realtime uses the official Supabase client, matching legacy HS256 project anon-JWT verification, room JWTs lasting at most five minutes, pre-expiry token refresh, channel replacement/retry, cleanup and full refresh after subscription/reconnect. The adapter's local lifecycle test injects the SDK boundary; it does not use a hosted provider. Missing public/server provider configuration remains an explicit four-second periodic fallback; subscribed mode also refreshes every 60 seconds for expiry.

Actual checks:

- `GEMINI_API_KEY= node --test --test-timeout=15000 tests/*.test.js`: 52 pass, 0 fail, 0 skipped. See tests.log. Tests execute the actual controller over HTTP and actual transpiled cache/client, including final-item deletion/reload/reconnect, history/shopping empties, stale read/write/auth/realtime callbacks, logout during final write refresh, offline writes and canonical-token race.
- `TEST_DATABASE_URL=<disposable local PostgreSQL> npm run test:sync-postgres`: 3 pass, 0 fail. See postgres.log. Migration ran repeatedly without resetting existing data; test-owned room rows/role/publication cleaned.
- `npm run test:postgres` with same disposable DB: 11 pass. See postgres-regression.log.
- `npm run test:client-postgres` with same disposable DB: 4 pass. See client-postgres-regression.log.
- `npm run build`: TypeScript and Vite/PWA succeed. See build.log.
- `git diff --check`: clean.

Fresh-agent review fix: the original App still rendered zero counts and an empty fridge before the first snapshot, despite the controller-level checks. Actual React rendering reproduced the defect for both cached room metadata and restored legacy sessions without room metadata (2 failing cases; cached-snapshot case already passed). App now gates the room tabs and bottom actions on snapshot availability, supplies loading/error/retry and a way to leave the room, and keeps complete cached snapshots visible when refresh fails.

- `GEMINI_API_KEY= node --test --test-timeout=15000 tests/*.test.js`: **55 pass, 0 fail, 0 skipped**, including 3 new actual React App tests. See [review-fix-tests.log](review-fix-tests.log).
- Tests mount actual App/children with React 18's test renderer and inject only the browser transport hook boundary backed by the production controller. They click retry and history/shopping tabs, change sessions while those tabs are active, and distinguish first-load failure from authoritative emptiness. No source-string assertion is used.
- `npm run build`: pass after the fix. See [review-fix-build.log](review-fix-build.log). The review fix changes App rendering and test dependencies only; database/provider verification remains the prior local evidence above.

Unfinished live gate: no hosted Supabase configuration is available to this session. No deployed two-browser latency measurement, hosted JWT acceptance, or cloud reconnect verification was performed. C021 must remain todo until those actual provider/browser checks pass. Periodic mode is not evidence of the PRD's <500 ms Realtime target. No deployment, commit, or card-done change was made by the builder.
