# C-022 planner verification — PARTIAL

2026-09-03. Reviewed actual verifier, purpose-separated signatures, PIN enforcement, real TypeScript client/cache, GIS callback lifecycle and rendered App/profile tests. Google certificate transport disables SDK retries at final request options and aborts real stalled HTTP requests. No client-supplied profile grants room access.

Independent final results: 63 unit/API/client/React tests passed with no skips (`planner-final-tests.log`), 11 PostgreSQL persistence/security regressions passed (`planner-postgres.log`), 4 real-client/PostgreSQL regressions passed (`planner-client-postgres.log`), TypeScript/Vite/PWA build passed (`planner-final-build.log`). Diff check clean.

An earlier planner run recorded 61/62 pass because the planner added the future C026 session-nickname endpoint after the Google builder's test run. A fresh agent added its authenticated 503 placeholder and generated OpenAPI operation, preserving the planning-contract assertion and replacing the old assumption that every auth path is public with an explicit public-route list. The new HTTP test confirms invalid/missing token401, valid room token503 and unchanged verified session. The final independent rerun passes63/63. This alignment does not implement C026 nickname updates.

Actual in-app browser at http://127.0.0.1:5173/ shows `Đăng nhập Google hiện chưa khả dụng. Hãy dùng tên và mã phòng.`, empty nickname input, PIN form, and no generated account. DOM evidence: `planner-browser-unavailable.txt`.

Real GOOGLE_CLIENT_ID/authorized deployed origin, hosted database and two real Google-account sign-ins remain missing. Signed RSA fixtures and local UI are not provider acceptance. Card stays todo; no deployment or production promotion.
