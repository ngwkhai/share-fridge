# C-021 — measured acceptance follow-up, 2026-09-04

Result: **PARTIAL / latency target not met.** No card gate is waived.

## Version and method

- Public URL: https://sharefridge.vercel.app/
- Deployed bundle verified by reading `document.scripts` in BOTH tabs: `assets/index-BsuQOj-H.js`.
- An old service worker had served `index-CgtZgiSq.js`. A browser hard reload (`super+shift+r`) loaded the current bundle without deleting the session.
- Two real in-app browser tabs, each showing `Đã kết nối`, joined the existing test room. These share browser storage/session; **they are not two independently isolated browser contexts or two phones**.
- Start: host `Date.now()` immediately before the real `Lưu vào tủ` button click in tab A. End: first read-only DOM observation of the new unique food name in tab B. No optimistic injection, intercepted fetch, or simulated event was used.
- Metric includes automation overhead, the source HTTP mutation, delivery/reconciliation, and recipient rendering. It is **click-to-peer-visible observation**, not isolated Broadcast latency and not exact database-commit-to-render time. Sampling adds detection delay.

## Actual observations

| Sample | Start (Unix ms) | First observed (Unix ms) | Click-to-peer-visible |
| --- | ---: | ---: | ---: |
| 2 | 1788514817993 | 1788514821136 | 3143 ms |
| 3 | 1788514841675 | 1788514844267 | 2592 ms |
| 4 | 1788514908472 | 1788514911116 | 2644 ms |

Median: **2644 ms**. Range: **2592–3143 ms**. Three samples are insufficient for a meaningful production p95 or SLA claim. These results do not demonstrate the PRD's <500 ms target.

## Production deployment follow-up

Commit `3764701` (delta session/payload guards) was deployed to Production deployment
`dpl_3gGv8XQjLisGerPSDUWxxs2p7red`. After a reload, both observed tabs ran
`assets/index-UovJyhOX.js` and showed `Đã kết nối`. A further real UI sample was
**3515 ms** click-to-peer-visible. It confirms the guard deployment reached Production;
it does not meet the latency target.

The next SQL migration is prepared locally: the database trigger will publish a
room-claim-fenced, sanitized `delta` at transaction commit. This avoids holding peer
visibility behind the source HTTP response and its bounded push dispatch. It is not
applied yet. The only available route to this database from this session is a temporary
secret-protected production admin endpoint. Automatic security review rejected deploying
that new privileged route without explicit authorization. A generated temporary secret
was immediately removed from Vercel and its local temp file; no endpoint was deployed
and a source scan confirms no admin route/secret remains. The migration must not be
presented as Production evidence until it is applied and remeasured.

Sample 1's locator wait timed out and the food was later present in both tabs: excluded from numeric timing results. An initial attempt at sample 4 lost its form while the previous source mutation finished; no sample was recorded for that attempt. The successful separately prepared sample 4 is the one above.

## Delete/reload and cleanup

Deleted `C021 verified build sample 4` using the real confirmation dialog. Tab B reported:

```json
{"connected":true,"deletedSampleAbsent":true}
{"connected":true,"deletedSampleAbsentAfterReload":true}
```

Then deleted samples 1–3 through their individual confirmation dialogs and observed their absence in tab A. All four foods created in this measurement run were removed (hard delete, no undo). Existing older test foods were left intact. Consequently this proves the deletion/reload of one item, **not the final-item-empty regression**. That full live scenario remains a separate gate.

## Local correctness fixes (not yet deployed)

Review of the new fast path found and fixed:

1. Malformed upsert payloads with a missing/null item could throw; they now return false without changing the snapshot.
2. A captured delta callback now belongs to its session generation, including leaving and rejoining the same room with a replacement token.
3. A delta invalidating an in-flight read now clears `refreshing`, so the abandoned read cannot leave the UI permanently busy.

Verification executed against the local fixes:

```text
node --test --test-timeout=15000 tests/room_sync.test.js tests/realtime_security.test.js tests/realtime_lifecycle.test.js tests/app_initial_sync.test.js
tests 27 / pass 27 / fail 0 / skipped 0

npm test
tests 118 / pass 118 / fail 0 / skipped 0

npm run build
exit 0; local bundle assets/index-DcoO8ngS.js

git diff --check
exit 0
```

Initial sandboxed test execution failed at binding localhost (`listen EPERM`); the permitted rerun above passed. Local tests/build are not substituted for deployed acceptance.

## Remaining measurement limitations / next engineering work

- The attempted API timestamp cross-check was blocked by automatic approval review because the generated room credential could not be accepted as independently authorized. The command did not run. No alternate credential extraction or authentication bypass was attempted. Explicit authorization of that test-room API access is needed before retrying it.
- `server/apiHandler.js` constructs `added_date` **before** `db.createFood`. It is not a transaction completion timestamp. Earlier evidence calling it the true write completion time is incorrect; those samples cannot isolate commit-to-render latency. The earlier offline test dispatched synthetic events, not a real network disconnect.
- Next: add bounded, secret-free timing for database transaction, notification work, HTTP response, Broadcast receive, and rendered update; compare before/after on a verified bundle with isolated sessions. Do not move the metric's start point or relax <500 ms to make the card green.
- The source currently awaits `dispatchChanges()` after writing and before replying. This is a candidate latency contributor, not a proven root cause. Region/DB round trips and transport timing must be measured before changing architecture or infrastructure.
- Repeat final-item deletion, real disconnect/reconnect, history/shopping changes, and session races on deployed isolated contexts. Keep C-021 todo until its full evidence exists.

## Remaining-card acceptance order

1. C-021: satisfy measured realtime/cache/session acceptance above.
2. C-026 (separate card session): actual 390/430 CSS-pixel viewport, long text, zoom, reduced-motion, photo states, screenshots and interaction review. No design-gate waiver.
3. C-027: after remediation dependencies are done, consolidate reproducible local/database/contract/browser gates, prove a representative regression fails, and capture deployed trace/Lighthouse/PWA evidence.
4. C-028: release only after C-027, with exact deployment version, health/readiness, provider/device acceptance and rollback record.
