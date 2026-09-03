# TypeScript client contracts: execute the imported client over real HTTP

## When to use this

Use when a browser client and a hand-written Node API share DTOs or route names.

Direct handler tests do not exercise the frontend method, URL or body. The previous suite passed while the real client sent POST to a PATCH consume route and omitted `/toggle`. Compile the actual client module with `typescript.transpileModule`, import the emitted module in the test, and bridge relative fetch URLs to a local HTTP server. Replace only browser storage and the URL base; leave HTTP parsing, authorization, routing and the real client response handling intact.

## Proven checks

- Centralize fetch error handling. Reject non-2xx responses with HTTP status/code, reject malformed successful payloads, and distinguish connection failures. A failed DELETE must not look successful; a failed list must not become an authoritative empty list.
- Validate the runtime response at the client boundary. Types disappear at runtime; imported TypeScript interfaces alone cannot catch a string `total` or missing food fields.
- Generate the committed OpenAPI JSON from `server/build-openapi.js`. `--stdout` allows a drift test without rewriting the repository. New routes must be added to the source and regenerated with `npm run api:spec`.
- Compile every schema with a real JSON Schema validator and check observed HTTP payloads against each route's response schema. Iterate the endpoint table in `flow/05-contract.md` so omitted routes fail the test.
- Keep old positional call semantics while changing wire contracts: `consumeFood(id, undefined, false)` must send `add_to_shopping_list: false`. Test both values through the imported client.
- PostgreSQL optional columns may contain NULL from legacy rows. Public DTOs must omit optional non-null string fields or provide a string; they must not emit a null that violates the client guard.
- A transfer retry must not recreate a food the user already deleted. Persist the per-shopping-item move marker in the same transaction as the bought state and inserted food. A row lock serializes workers; a replay marker survives uncheck/recheck and process restarts. Injecting a food-insert failure proves rollback of both bought state and marker.
- Repeated database tests can exhaust a real shared create-IP limiter. Use a unique per-run test proxy identity shared by the two test workers, and clean only that identity's hashed buckets and test-owned room buckets. The worker test environment explicitly enables trusted Vercel headers; ordinary local requests still reject spoofed forwarded headers through the separate security suite.

## Smoke tests

```sh
node --test --test-timeout=15000 tests/client_contract.test.js
npm run api:spec
npm run build
```

With a disposable local `TEST_DATABASE_URL` supplied through the environment:

```sh
npm run test:postgres
npm run test:client-postgres
```

The latter suite ran 12 concurrent requests across two independent PostgreSQL API processes and observed exactly one inserted food. It also verified a new process, uncheck/recheck, deletion followed by retry, scoped edits and transaction rollback. These are local proofs; cloud database and deployed browser verification remain separate gates.

*Provenance: ShareFridge/C-020, 2026-09-03. Evidence: `evidence/C-020/`. 40 local tests, 11 PostgreSQL regression tests and 4 PostgreSQL CRUD tests passed.*
