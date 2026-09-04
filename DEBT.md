# DEBT — deliberate gate-skips

Each line is a loan: a gate the project knowingly did not close, with a concrete
exposure and a condition that must be true before the loan is closed. See
`CLAUDE.md`'s "Debt (deliberate gate-skips)" section for the protocol.

- [ ] DEBT: C-021's realtime sync does not meet the PRD's `<500ms` target (F5:
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
