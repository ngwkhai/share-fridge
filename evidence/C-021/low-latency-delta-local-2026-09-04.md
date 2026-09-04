# C-021 local delta fast path — 2026-09-04

The earlier deployed measurement showed that an authenticated `GET /api/foods`
alone took 0.8–1.3 seconds, so a Realtime invalidation followed by a full REST
refresh cannot meet F5's `<500ms` visible-update target.

This change sends a typed, room-scoped food/shopping delta from the client that
received a successful mutation. A subscribed peer applies the delta immediately;
the existing database-triggered `changed` broadcast still schedules the full,
authoritative snapshot refresh for reconciliation. Invalid delta shapes and
cross-room data are ignored. Per-session tombstones prevent a delayed upsert from
bringing a deleted stable ID back into view.

Local checks run after the change:

```text
npm run build                                      PASS
node --test --test-timeout=15000 \
  tests/room_sync.test.js tests/realtime_security.test.js \
  tests/realtime_lifecycle.test.js tests/app_initial_sync.test.js
24 passed, 0 failed
```

The new tests prove that the peer notification is issued after REST write success
but before the source device waits for its full refresh, and that a valid peer
delta updates a complete snapshot immediately. This is local evidence only: the
production two-browser latency measurement remains required before C-021 can be
closed.
