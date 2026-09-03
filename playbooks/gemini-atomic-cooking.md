# Gemini output validation and atomic recipe cooking

## When to use this

Use for AI suggestions that choose mutable inventory and for multi-item actions initiated by a recipe.

A provider JSON schema cannot prove that ingredient IDs belong to the current inventory. Check schema, exact IDs, names and expiry in the application, then check current availability again inside the cooking transaction. A recipe returned before another roommate cooks is already stale by the time its button is clicked.

## Proven checks

- Send `responseJsonSchema` with JSON MIME on the contracted `gemini-2.5-flash` generateContent route; validate the result locally as well. `finishReason` must be STOP. Provider errors and missing configuration return explicit heuristic source, never a fake provider pass. Conservative fallback returns no recipe for unrelated inventory such as yogurt alone.
- Put the API key in `x-goog-api-key`, not a URL. Log only bounded reason codes and numeric statuses. The local transport test sends an error body containing a secret sentinel and confirms it is never logged.
- Bound response bytes while reading the stream, not after `res.json()` allocates it. The transport test proves the 128 KiB limit cancels the reader. A real local stalled HTTP response proves the 8-second production deadline (50 ms in the fixture) aborts the request and does not retry.
- Explicit Vietnamese shelf life must match the full number: an unbounded `\d{1,3}` search parses “1000 ngày” as “000 ngày.” Validate negative/fractional/out-of-range values and retain zero with `??`, not `||`. Quantity, packaging and storage must survive the rendered form, not only a parser unit test.
- Editable transcripts need an input generation as well as an open/close generation. Discard a parse response if the user changed the transcript while waiting. Show the safe validation message so correcting a bad day count is possible.
- Serialize a room-scoped idempotency key with an advisory transaction lock. Compare a hash of canonical sorted IDs and options; changed payload returns 409. Lock all referenced food rows in deterministic ID order before the first update. That ordering is required because food/shopping writes also acquire the room revision trigger lock.
- Store the complete replay result in the same transaction as every food update and optional shopping insertion. Twelve requests across two PostgreSQL processes returned the same result, with one shopping row per consumed food; replay still worked after worker restart. An injected shopping failure rolled back foods, replay record and revision together.
- Use a bounded lock wait. This batch sets local lock_timeout=2s and statement_timeout=5s; lock/cancellation/deadlock errors become a safe retryable BATCH_BUSY after rollback. A held target-row lock timed out in about 2 seconds; retry succeeded when the blocker released it.
- Keep a stable attempt key while retrying the same UI action. Disable competing cook/refresh actions while pending, and use exact recipe IDs rather than name substring lookup. The rendered App test distinguishes three identical names and verifies only the selected two IDs enter the POST.

## Smoke tests

```sh
GEMINI_API_KEY= node --test --test-timeout=15000 tests/gemini_ai.test.js tests/client_contract.test.js tests/app_initial_sync.test.js
```

With a disposable TEST_DATABASE_URL:

```sh
npm run test:ai-postgres
```

These tests use a fixture provider transport. Deployed acceptance must independently observe `source: gemini-2.5-flash`, selected IDs, and committed PostgreSQL effects. The existence of a configured key is insufficient.

Primary references: [Gemini 2.5 Flash model](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash), [generateContent reference](https://ai.google.dev/api/generate-content), [structured output](https://ai.google.dev/gemini-api/docs/structured-output).

*Provenance: ShareFridge C-023, 2026-09-03. See evidence/C-023 for local HTTP, rendered React, and two-worker PostgreSQL results. No real-provider completion claim.*
