# C-023 — PARTIAL local verification, 2026-09-03

Status remains **todo**. Implementation and local proofs are available for planner review. Hosted PostgreSQL is not configured; no deployed C-023 or successful real Gemini provider request has been demonstrated.

## Reproducible local evidence

- `GEMINI_API_KEY= node --test --test-timeout=15000 tests/*.test.js`: **72 passed, 0 failed, 0 skipped**. See [tests.log](tests.log).
- `TEST_DATABASE_URL=<disposable PostgreSQL DSN> npm run test:ai-postgres`: **6 passed, 0 failed, 0 skipped**. See [postgres.log](postgres.log). Local PostgreSQL 16.14, two independent API worker processes; tests create random owned rooms and clean only those rooms/limiter buckets. Existing room 644780 is untouched.
- `npm run build`: TypeScript and Vite pass, 1,891 modules. See [build.log](build.log).
- `git diff --check`: passed.
- Prerequisite smoke before implementation: 27 existing client/Google/sync/realtime tests passed.

## What the tests prove

1. Provider fixtures exercise malformed JSON/schema, wrong enum/bounds, missing/foreign/expired/consumed IDs, mismatched ingredient names, conservative empty/unrelated inventory, expiry while waiting, source and schema request shape. The real local stalled HTTP transport is aborted without retry; response body over 128 KiB is canceled. Logs exclude sentinel credentials/provider body/prompt.
2. The actual HTTP handler fixes the observed half-kilo/7-day sentence; rejects -1/1000/fractional days and preserves zero. The rendered Voice and QuickAdd components show source, allow review, keep zero/quantity/tag/explicit compartment and discard late responses after close or transcript edit.
3. The actual rendered App sends one POST using exact recipe IDs among identically named food lots. All competing buttons are disabled while pending, missing ingredients are displayed, and retry sends the same idempotency key.
4. PostgreSQL proves 12 concurrent same-key replays transition each selected row once; one shopping row per food; same-key changed payload conflicts; process restart preserves replay. Different-key overlapping batches have one complete winner. Missing/foreign/expired/duplicate input cannot partly mutate another row. Absolute expiry corrected by an edit is authoritative.
5. A test-owned trigger rejects a shopping insert: food updates, shopping rows, replay key and room revision all roll back. A held food lock returns safe 503 BATCH_BUSY in about 2.03 seconds, and the same request succeeds after release. A single-item consume racing a batch cannot partly apply the losing batch.

## Existing deployed baseline — not C-023 proof

The planner observed old C-018 Preview on 2026-09-03T08:12:21.372Z at https://sharefridge-d4fjygcpu-khaindhrt-9606s-projects.vercel.app. Voice request returned HTTP 200 **source=heuristic**, empty quantity and 14 days for the input:

`Nửa ký thịt ba chỉ trong hộp xanh, ngăn đông, dùng trong 7 ngày`

This baseline is now a regression fixture. Correct local output is name `thịt ba chỉ`, quantity `0.5 kg`, compartment `FREEZER`, container_tag `Hộp xanh`, shelf_life_days `7`, source `heuristic` when no provider is configured. A configured Vercel Gemini key did not establish a successful provider result. No existing provider secret was exported.

## Remaining acceptance

Deploy the reviewed code with hosted PostgreSQL and the existing server-side Gemini configuration. In a disposable room, obtain both parse and recipe responses with `source: gemini-2.5-flash`; record sanitized results and the runtime OpenAPI URL. Cook the returned exact IDs and verify all committed rows, shopping counts, and replay behavior on the deployed database. Capture browser interaction on that deployment. Fallback output is not a provider acceptance pass.
