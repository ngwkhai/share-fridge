# C-020 — PARTIAL evidence, 2026-09-03

Status remains `todo`. Implementation and local gates pass. Hosted CRUD/browser verification requires the linked deployment to have a working migrated `DATABASE_URL`; no deployed C020 success is claimed here.

## Implemented and observed locally

- The actual transpiled `src/services/api.ts` performs add/edit/consume/history/shopping/toggle/delete over HTTP. Consume uses PATCH with `add_to_shopping_list`; the existing third positional false option is preserved. Shopping uses `/toggle`, push registration uses `/api/notifications/subscribe`.
- `ApiError` preserves HTTP status and code. Missing token401, foreign room403, missing/foreign item404, malformed input400, injected database500, invalid successful payload, non-JSON error and network failure all reject. Failed room reads do not auto-create a room, and failed lists/deletes never appear successful.
- CRUD validates names, bounded text, enum compartments, integer shelf days0..365, real UTC expiry timestamps and booleans. Actor compatibility fields must be strings and never override the verified session. Zero shelf days expires at the exact added timestamp.
- Shopping/food delete responses include `deleted_id`; both list types include `total`. Food edits retain the ID/history identity. Optional legacy PostgreSQL NULL strings are omitted from public DTOs.
- 12 simultaneous transfer requests across two independent PostgreSQL API processes created one food and one durable replay marker. Retry after a cold worker, uncheck/recheck and deletion did not duplicate or resurrect that purchase. A test-owned database trigger rejecting the food insert left `is_bought=false` and no replay marker; retry after recovery inserted one food with the default compartment and three-day expiry.
- Runtime OpenAPI contains all29 planning method/path pairs and39 schemas. The test checks generated-source drift, compiles every schema, and validates actual client HTTP response payloads. Public health/spec/config and cron authentication expectations are explicit.
- Malformed subscription objects, endpoint/keys types and device names are rejected400 without persistence. Web Push delivery itself remains C024.

## Actual commands/results

```text
GEMINI_API_KEY= node --test --test-timeout=15000 tests/*.test.js
40 tests; 40 pass; 0 fail; 0 skipped; 913.918959ms

TEST_DATABASE_URL=<disposable local PostgreSQL> npm run test:postgres
11 tests; 11 pass; 0 fail; 0 skipped; 785.525041ms

TEST_DATABASE_URL=<disposable local PostgreSQL> npm run test:client-postgres
4 tests; 4 pass; 0 fail; 0 skipped; 413.532042ms

npm run build
TypeScript success; Vite6.4.3: 1845 modules; build993ms.

node server/build-openapi.js
Generated29 operations and39 schemas; drift test passed.

git diff --check
Exit0, no whitespace errors.
```

Logs: [tests.log](tests.log), [postgres-regression.log](postgres-regression.log), [postgres-client.log](postgres-client.log), [build.log](build.log).

## Remaining gates and boundaries

- No C020 deployment/browser verification was performed by this builder. The planner owns independent review, rerun and live verification. Do not mark done from these local logs.
- `/api/config` is public without a database and accurately advertises four unavailable integrations. Planned provider-only routes return safe503 and carry `x-availability` notes until their owning cards implement them.
- Existing recipe responses still lack `food_ids`/`source`; the strict client rejects incomplete successful payloads. C023 owns real AI output/schema correction and atomic batch cooking. This issue is explicitly retained, not disguised by invented recipe IDs or provider claims.
- Cache replay, stale-room UI updates and full UI error surfacing remain C021/C026. C020 removes the API service's silent room recreation only.
- Runtime spec source is `server/build-openapi.js`; later cards must update it and regenerate `server/openapi.json`.
