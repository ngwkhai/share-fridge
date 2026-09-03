# PostgreSQL: prove persistence with processes, transactions and nonowner RLS

## When to use this

Use when replacing an in-process store or deploying a Node API to multiple serverless workers.

A second Pool in the same process does not prove a fresh worker can recover state. An owner/superuser query does not prove RLS: PostgreSQL normally lets those roles bypass policies. `SELECT 1` alone does not establish that required schema has been migrated.

## Proven checks

- Inject a test-only memory adapter explicitly. Runtime requires `DATABASE_URL`; missing configuration returns safe 503, never seeded RAM. Reject the adapter in production.
- Keep every `BEGIN`, row lock, dependent write and `COMMIT` on the same checked-out client. In this project ten concurrent consume calls from two child API processes produced one shopping row; a test-owned trigger rejecting that insert rolled consumption back.
- Serialize checking and updating failed PIN counters in PostgreSQL. A separate check followed by increment can allow parallel workers to exceed the threshold. Sort limiter keys before locking to avoid inconsistent lock ordering.
- Migration preserves UUID/hash/timestamps and uses an advisory transaction lock. Re-running policy/publication creation needs explicit idempotence checks. Restrict grants as well as policies. Rooms and push subscriptions remain inaccessible to client roles; only foods/shopping SELECT may use a room JWT claim.
- Exercise RLS using a randomly named `NOSUPERUSER NOBYPASSRLS` role, with SELECT granted only to the intended data tables, and explicitly verify zero rows before setting a room claim.
- Readiness checks the migration marker and expected columns. A renamed/missing column must return unavailable even when the TCP connection is healthy.
- pg can emit an `error` event on idle pool connections outside request handling. Add an error listener that does not expose credentials; let pg remove broken clients.

## Smoke test

Supply a disposable `TEST_DATABASE_URL` through the environment (never a production URL), then run:

```sh
npm run test:postgres
```

The suite fails explicitly if the URL is absent. It starts two independent child API processes, stops/restarts them, checks retained room/food/history/shopping/subscription IDs and absolute dates, and keeps schema while cleaning test-owned rows/roles. The memory-adapter suite still runs via `npm test`; it does not replace this integration gate.

Sources used for implementation: [node-postgres transactions](https://node-postgres.com/features/transactions), [PostgreSQL row security](https://www.postgresql.org/docs/16/ddl-rowsecurity.html).

*Provenance: ShareFridge/C-019, 2026-09-03, PostgreSQL 16.14. Local integration evidence is in evidence/C-019/postgres.log. Hosted persistence still requires configured hosted PostgreSQL and redeploy verification.*
