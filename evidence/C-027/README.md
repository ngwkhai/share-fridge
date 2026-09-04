# C-027 Evidence — Release Gates, Regression Suite & CI Consolidation (2026-09-04)

## Summary of Accomplishments

1. **E2E Browser & Contract Test Suite (`@playwright/test`)**:
   - `e2e/browser.spec.js`: 4 comprehensive browser journeys executed against live production (`https://sharefridge.vercel.app`):
     - Full roommate lifecycle: room creation, food add via QuickAddModal, status rendering, consume ("Đã nấu") moving item to shopping list, shopping list toggle/delete, and history cleanup.
     - Two isolated browser contexts: Roommate A creates room, Roommate B in isolated incognito context joins by room code + passcode; both observe shared inventory; Roommate B deletes food with confirmation modal.
     - Auth rejection: wrong passcode displays danger error banner and blocks entrance.
     - Session persistence: page reload restores authenticated session and inventory from local cache/authoritative snapshot without re-authenticating.
   - `e2e/contract.spec.js`: 5 contract validation tests verifying live endpoints:
     - `GET /healthz` -> 200 with status "ok", version, timestamp.
     - `GET /readyz` -> 200 with status "ok", database "postgres".
     - `GET /api/openapi.json` -> 200 with valid OpenAPI 3.0.0 paths.
     - `GET /api/config` -> 200 with capabilities and Google Client ID.
     - `POST /api/auth/create-room` & `/api/auth/join-room` -> 201/200, 401 unauthenticated, 403 cross-room.
   - `e2e/lighthouse.spec.js`: automated Lighthouse audit against deployed production.

2. **Automated CI/CD Pipeline (`.github/workflows/ci.yml`)**:
   - Automated workflow running on push and PR to main.
   - Steps: Node.js setup, dependency install (`npm ci`), production build (`npm run build`), unit test suite (`npm test`), Playwright browser install, and E2E execution (`npx playwright test`).
   - Artifacts: stores Playwright report and trace on failure.
   - Credentials isolation: skips live provider tests when provider keys are not present.

3. **Regression Demonstration (`scripts/demonstrate-regression.js`)**:
   - Verifies that representative route, auth, and cache regressions would fail immediately:
     - Auth regression: unauthenticated call to `/api/foods` is blocked with 401 `UNAUTHORIZED`.
     - Cross-room isolation regression: access with valid token to a foreign room code is blocked with 403 `FORBIDDEN`.
     - Cache/room takeover regression: re-creating existing room code with wrong passcode is blocked with 409 `ROOM_EXISTS`.

4. **Lighthouse Audit Results**:
   - Accessibility: **100%** (1.00)
   - Best Practices: **100%** (1.00)
   - SEO: **83%** (0.83)
   - Performance: **78%** (0.78)

## Test Run Results

- **Unit/Contract test suite**: 118 passed, 0 failed ([unit-tests.log](./unit-tests.log))
- **Production build**: exit 0 in 1.37s ([build.log](./build.log))
- **Playwright E2E suite**: 10 passed in 55.8s ([playwright-e2e.log](./playwright-e2e.log))
- **Regression demonstration**: 3/3 passed ([regression-demonstration.log](./regression-demonstration.log))
- **Lighthouse JSON report**: [lighthouse.json](./lighthouse.json)
