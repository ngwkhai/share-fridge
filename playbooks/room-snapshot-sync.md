# Room snapshots: empty is authoritative; every callback belongs to a session

## When to use this

Use for React room data cached locally and refreshed by polling or Realtime.

An empty successful GET is data. Replaying a nonempty cache turns an intentional deletion into a new row with a new ID and expiry. A generation check before a write resolves is also insufficient: if its final refresh awaits, the session can change during that await. Check again after it.

## Proven checks

- App delegates to one controller. It commits room/active/history/shopping snapshots only after all reads succeed, including empty arrays. Failed initial loading has its own UI; it cannot display an empty fridge as if confirmed.
- Controller tests cannot prove App renders that distinction. Mount the actual App with the production controller at its hook boundary; defer/reject the first read, click retry, and switch room while history/shopping is selected. Room metadata is not a complete snapshot, and restored legacy sessions may have no room metadata. The snapshot guard must precede every tab's empty state and data actions; a complete stale snapshot remains readable.
- Session generation guards reads, transport callbacks, errors, queued writes, operation completion and post-write refresh completion. A separate request ticket discards snapshots started before mutations or newer refreshes.
- 401 invalidates the current session. A stale 401 from an old session cannot invalidate its replacement, and 403 does not imply the current session is invalid.
- Use the canonical session cache token when localStorage events race separate legacy-key writes. Cache keeps original IDs and ISO expiry; reading it recalculates age without changing expiry. Cache never becomes a POST body.
- Hard DELETE Realtime payloads are a poor room-privacy boundary. This project publishes room_sync_versions INSERT/UPDATE invalidations only; a fixed-search-path owner trigger increments revision in the same transaction as food/shopping writes. The local DB test proves rollback preserves revision, and a nonowner role sees only its room. Publishing raw foods/shopping or FOR ALL TABLES disables readiness.
- Subscribe before claiming connected, then complete a fresh snapshot. Renew short room JWTs before expiry; replace failed/closed channels; stop timers/listeners and ignore callbacks after disposal. Keep slow refresh for time-based expiry and label the four-second fallback as periodic updates.
- Direct delta callbacks must capture the session generation too, including replacement sessions in the same room. Reject missing/null delta items without throwing. When a delta cancels an older read ticket, clear that read's refreshing state.
- Live latency evidence must identify the bundle actually loaded in each browser, not merely the last successful deployment. In the 2026-09-04 follow-up, a hard reload replaced a stale service-worker bundle without clearing the session. Label click-to-DOM timings separately from commit-to-DOM: a server timestamp constructed before an INSERT is not its commit time. Shared-storage tabs and synthetic offline events do not prove isolated-session or real-disconnect acceptance.

## Smoke tests

```sh
node --test --test-timeout=15000 tests/room_sync.test.js tests/realtime_security.test.js tests/realtime_lifecycle.test.js
node --test --test-timeout=15000 tests/app_initial_sync.test.js
```

With a disposable `TEST_DATABASE_URL`:

```sh
npm run test:sync-postgres
```

The lifecycle test exercises the real client adapter with an injected SDK boundary and controlled timers. It does not prove hosted Supabase latency. The supported credential path is a matching legacy HS256 anon JWT/project secret; presence of a publishable key is not proof the issuer can sign accepted tokens.

Primary references: [Supabase custom tokens and Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Realtime token authorization](https://supabase.com/docs/guides/realtime/authorization), [setAuth](https://supabase.com/docs/reference/javascript/setauth).

*Provenance: ShareFridge/C-021, 2026-09-03. Local regression and PostgreSQL proof in evidence/C-021; deployed two-browser latency remains a separate gate.*
