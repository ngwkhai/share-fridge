# C-018 — local and deployed verification (2026-09-03)

Planner reviewed commit ab20be2 and independently ran 32 tests (0 failures/skips), build, and the deployed security probe. Card complete on the linked Preview; production release remains C-028.

## Actual commands and results

- `npm test > evidence/C-018/tests.log 2>&1` — exit 0; 32 tests pass, 0 fail, 0 skipped, 777.909459 ms. Loopback-listener permission was required: the initial sandbox run failed with `listen EPERM` and was stopped; this log is the successful permitted rerun.
- `npm run build > evidence/C-018/build.log 2>&1` — exit 0; TypeScript and Vite production build succeed; 1,845 modules transformed.
- Automated regression cases: `tests/room_authorization.test.js` (14 tests). It calls the real serverless handler over local HTTP, including every implemented room-data route. It also calls that same handler with already-parsed object/string/Buffer request bodies.

## Proven outcomes

- Missing or malformed Bearer session: HTTP 401 on room detail, foods, shopping, AI and notification writes.
- Valid room B session accessing room A: HTTP 403/404; the stored food, shopping record and subscriptions remain byte-for-byte unchanged.
- Both create endpoints reject existing room codes with HTTP 409. Old PIN still joins; attempted replacement PIN fails; existing inventory remains.
- Room create/detail/token-verify responses contain only public room fields; no hash or salt.
- Actor names for food creation/consumption come from the session.
- Token verification rejects bad signatures, missing/non-numeric/expired expiry, invalid room/nickname claims and unknown rooms.
- Production missing/default/weak session secret: HTTP 503 before inserting a room. Development fallback is random per process, never the committed old secret.
- Four-to-six-digit PIN, six-digit room code and text bounds are validated. Malformed JSON returns a safe HTTP 400; internal failures return generic HTTP 500 with an error code.
- Five incorrect PIN attempts are allowed to fail, the sixth is HTTP 429; test-owned limiter keys are explicitly reset before this assertion, so it does not depend on previous tests.
- OpenAPI includes the three implemented authentication endpoints, protected-operation bearer requirements and safe response/error schemas.

## Explicit limits

This card does not claim database persistence, shared rate limiting across workers, Google, live push, browser integration, provider success or a production release. The current data adapter is still in-memory and has existing demo seed rooms; production adapter and seed isolation belong to C-019. Session secret should be generated independently with at least 32 random bytes and shared by deployment instances. Existing legacy PBKDF2 hashes remain accepted; newly created rooms use scrypt, without resetting stored room records.

Live verification completed at 2026-09-03T01:09:57Z: [sanitized log](live.log), [reproducible probe](live-probe.mjs), 13/13 checks passed. Deployment https://sharefridge-d4fjygcpu-khaindhrt-9606s-projects.vercel.app; spec at /api/openapi.json (200, RoomBearer scheme). Vercel CLI uses the existing authorized account for Preview protection. Tokens and passcode hashes were not logged. Two disposable rooms were created; the test food was deleted. The first probe attempt had a typo in the expected security-scheme name (BearerAuth instead of the actual RoomBearer); the corrected complete rerun passed.
