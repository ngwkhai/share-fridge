# DEBT — deliberate gate-skips

Each line is a loan: a gate the project knowingly did not close, with a concrete
exposure and a condition that must be true before the loan is closed. See
`CLAUDE.md`'s "Debt (deliberate gate-skips)" section for the protocol.

- [x] RESOLVED 2026-09-04 by operator-authorized requirement revision: F5 now targets <=5 seconds under stable connected foreground conditions, as recorded in `flow/03-prd.md`, `flow/05-contract.md` and `cards/C-021.md`. Version-verified observations of 2592–3515 ms fit that budget. The former <500ms requirement is retired; no claim is made that it was achieved. Correctness, isolated-session and reconnect acceptance remain separate obligations. The unpublished database delta migration is not required to resolve this debt. Historical investigation follows; earlier root-cause conclusions and simulated-network claims are qualified in `evidence/C-021/measured-acceptance-2026-09-04.md`.

  Original DEBT: C-021's realtime sync does not meet the PRD's `<500ms` target (F5:
  "roommate's updates appear live within 500ms") — measured 1231-3169ms across 3
  reproducible runs against Production using two real browser contexts on the actual
  deployed Supabase Realtime channel (genuinely subscribed, not degraded polling); see
  `evidence/C-021/live-2026-09-04.md`. The exposure: roommates may see a multi-second
  delay before a change appears, worse than the product promise; reconnect-after-offline
  and cache-resurrection-prevention both still work correctly, only latency is affected.
  Root cause is most likely Supabase's `postgres_changes` WAL-based broadcast latency on
  this project's tier, not a bug in this app's own code (the app-side debounce before
  refetching is only 30ms). Not attempted in this session: switching the transport to
  Supabase's Broadcast API (client-side self-broadcast on mutation success, bypassing
  the WAL path) — a real, buildable fix, but a rearchitecture of a currently-working,
  already-tested sync path in a live single-database production app, with no local
  disposable Supabase/Realtime environment available in this session to regression-test
  it against before touching production. Close before: either (a) the Broadcast-API
  switch is implemented and its own latency is measured to confirm it actually meets
  the target (not just assumed to), or (b) the operator explicitly accepts current
  latency and the PRD's `<500ms` line in `flow/03-prd.md` is corrected to match reality.
  Opened 2026-09-04 (cards: C-021).

  **Update 2026-09-04 (same day):** attempted the Broadcast-API transport switch
  (see `supabase/realtime_broadcast.sql`, applied to the live database with the
  operator's explicit approval). It is deployed and safely additive (does not
  replace or risk the existing `room_sync_versions`/`postgres_changes` fallback).
  Result: **inconclusive improvement, target still not met.** Measured "event
  received -> refetch triggered" time dropped in some runs (653-1428ms vs the
  prior 1231-3169ms baseline) but NOT consistently, and total time-to-visible
  stayed in the same 2.7-3.1s range across 3 post-migration runs. Root cause
  found: a single `GET /api/foods` call against Production takes **0.8-1.3s on
  its own** (measured directly via `curl -w '%{time_total}'`), independent of
  realtime entirely — this dominates the total latency regardless of transport.
  This is very likely Vercel serverless cold-start and/or Supabase connection-
  pooler latency, not a realtime-layer problem, and is a DIFFERENT, deeper
  investigation than what this DEBT line originally scoped. See
  `evidence/C-021/live-2026-09-04.md`'s "Broadcast attempt" section for full
  measurements. Close before: the REST round-trip latency itself is
  investigated and reduced (connection pooling, function warm-up, or reducing
  the number of parallel calls `refresh()` makes), separately from the realtime
  transport question this line was originally about.

  **Operator decision 2026-09-04:** the operator reviewed the measured result and
  accepted the current latency for this release, stating that further measurement
  has no practical value. This accepts the product exposure; it does **not** turn
  the failed `<500ms` verification into passing evidence. C-021 remains `todo`
  until the PRD/contract target is explicitly amended and the card's acceptance
  criteria are reconciled, or the target is actually met.
