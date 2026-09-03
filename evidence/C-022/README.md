# C-022 — PARTIAL local evidence

Date: 2026-09-03. Branch: `codex/C-022-google-identity`, builder base `16a1e5b`.

Implemented official Google Identity Services button + Google server verification, purpose-separated short-lived supplemental identity token, mandatory room PIN, signed session profile propagation/cache reconciliation, header/settings avatar/email, cancellation and external logout cleanup. No mocked identity remains in the application.

## Reproducible local verification

```sh
GEMINI_API_KEY= node --test --test-timeout=15000 tests/*.test.js
npm run build
# Disposable local database only:
TEST_DATABASE_URL=postgresql://sharefridge@127.0.0.1:55439/sharefridge_test npm run test:postgres
TEST_DATABASE_URL=postgresql://sharefridge@127.0.0.1:55439/sharefridge_test npm run test:client-postgres
```

- `tests.log`: 62 passed, 0 failed, 0 skipped (2156.706417 ms).
- `build.log`: TypeScript + Vite passed; 1891 modules, 8 PWA precache entries.
- `postgres.log`: 11 passed, 0 failed, 0 skipped; real local PostgreSQL durability, room authorization, readiness, RLS and restart regression.
- `client-postgres.log`: 4 passed, 0 failed, 0 skipped; real client/database CRUD and concurrency regression.
- `git diff --check`: passed.

### Planner contract alignment after the Google implementation

The planner added the future C026 `PATCH /api/auth/session` contract after the original C022 verification. A fresh integration pass reserved its strict nickname request and `AuthSession` response in the generated runtime spec, with `x-availability: C026`. The handler requires a valid room session and returns safe 503 until C026 implements renewal. No nickname update is implemented or claimed here.

- `spec-alignment-tests.log`: 63 passed, 0 failed, 0 skipped (1587.480125 ms), using the full command above. HTTP assertions prove missing/invalid tokens get 401, an authenticated request gets 503, and the original verified session remains unchanged. Generated/source/served spec alignment passes. The old auth-schema assertion now lists public endpoints explicitly instead of treating every `/api/auth/*` route as public.
- `spec-alignment-build.log`: TypeScript/Vite/PWA build passed, 1891 modules and 8 precache entries.
- `git diff --check`: passed. No database changes or deployment were made in this alignment pass.

`tests/google_auth.test.js` uses real RSA signatures and Google's actual JWT verification, substituting certificate retrieval only. It rejects wrong keys, malformed credentials, expired credentials (including 1 second ago), wrong audience/issuer/azp, unverified email and unsafe profile picture. The actual client propagates two distinct stable fixture subjects through create/join/verify/cache; missing/wrong PIN and cross-room access are refused. Purpose-separated identity tokens cannot be room tokens, and room tokens cannot be supplemental Google identity tokens. Malformed cache profiles are rejected, profile tampering is repaired from the signed room payload, legacy room sessions still verify, and logout fences a late Google response.

The certificate HTTP test observes exactly two HTTP requests for two cases: one 503, one deliberately stalled endpoint. It verifies no retries and an actual abort/deadline, with safe provider errors. The first run exposed nested retryConfig overriding retry:false; the final transport overrides both.

`tests/app_initial_sync.test.js` renders the actual App and Google button. In addition to the retained C021 snapshot regressions, it proves unavailable Google messaging, verified profile in header/settings, external session logout clearing identity/avatar, cancelled callback exclusion, late verification response exclusion, and visible verification errors. SDK/provider boundaries in these UI tests are fixtures; they are not Google live sign-ins.

## Not completed / no deployed claim

No authorized Google OAuth client/origin is configured on the deployed environment and the Preview database is still unavailable. Therefore the two-real-account deployed test, real provider consent, avatar reload on deployed origin, and live OpenAPI verification have not been run. No deployment or production mutation was performed for C022. Card remains `todo`, PARTIAL only.

Configure `GOOGLE_CLIENT_ID`, authorized JavaScript origins, PostgreSQL and SESSION_SECRET per `DEPLOY_GUIDE.md`, then perform the card's live two-account verification. Never store actual credentials/tokens in evidence.
