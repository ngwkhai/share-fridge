# Audit remediation — execution scope, 2026-09-03

Input: audit/2026-09-03/REPORT.md and user authorization to create/execute cards. Preserve existing product scope; repair observed failures. No paid infrastructure creation or destructive migration.

Order: C-018 auth; C-019 PostgreSQL; C-020 client contract; C-021 cache/realtime; C-022 Google; C-023 AI/atomic cook; C-024 Push; C-025 photos/PWA; C-026 UI; C-027 regression gates; C-028 verified deploy.

Architecture amendment: use a durable server-side PostgreSQL repository with Supabase-compatible room isolation, existing HMAC room sessions, supplemental verified Google identity, authenticated realtime and explicit polling degradation. Preserve data; no silent recreation/reseeding. Tests accompany every implementation card. Integration/release depend on all remediation cards.

Shared files force serial build sessions. Planner delegates one agent per card, reviews, reruns verification and records PARTIAL/blocked evidence honestly. Live access and providers remain required for done, even after local tests pass.

## Execution checkpoint — 2026-09-03

Reviewed local work is retained on `codex/remediation-integration`; `main` and production are not promoted while release gates remain open. Original C001–C017 statuses are historical, not evidence of remediation completion.

Exception, 2026-09-03: the operator explicitly connected a real Supabase project and promoted to
Production ahead of C-027/C-028, specifically so C-024's physical-device Verify item could be
closed (Vercel Cron only executes on Production; the Preview deployment's SSO Deployment
Protection also blocked a phone browser). This was an explicit operator decision, not a
planner-side skip. C-018..C-023, C-025 and C-026 were not re-verified end-to-end against this now
one live database and have not moved past their previously recorded status; do not treat the live
`/readyz`/`/api/config` flags as acceptance evidence for cards other than C-024.

| Card | Current outcome | Remaining acceptance |
|---|---|---|
| C018 | Done; security behavior verified on existing Preview | Included in final integrated release regression |
| C019 | PARTIAL; durable PostgreSQL repository and real local DB tests | Hosted DB, migration, multi-instance/redeploy persistence |
| C020 | PARTIAL; actual client/API contracts and local browser CRUD verified | Deployed CRUD and runtime spec |
| C021 | PARTIAL; authoritative snapshots, revision/RLS and two local tabs verified | Hosted Realtime, two devices, reconnect and measured latency |
| C022 | PARTIAL; real GIS implementation, RSA verification and local failure states verified | Authorized origin and two real Google accounts |
| C023 | PARTIAL; 72 application tests, 24 PostgreSQL tests, local voice-draft/cook/history verified; commit81257ed | Real Gemini source and deployed exact-ID cooking/DB evidence |
| C024 | Done; real push verified live on Production, including an actual notification received on the operator's phone | Included in final integrated release regression |
| C025 | Prepared; bounded photo/storage/PWA contract recorded | Implementation, review, hosted private storage and two-device image/install evidence |
| C026 | Prepared; accessible interactions and real nickname-session update contracted | Implementation, mobile/keyboard review and deployed interaction evidence |
| C027 | Dependency gate blocked | C018–C026 accepted before integration acceptance card starts |
| C028 | Dependency gate blocked | C027 accepted before final verified release |

Infrastructure update, 2026-09-03: Supabase/PostgreSQL project access is now live (`DATABASE_URL`/`SUPABASE_*` configured on both Preview and Production), and Web Push sender/scheduler configuration (`VAPID_*`/`CRON_SECRET`) and physical-device acceptance are done, closing C-024. Still pending: private Storage configuration (needed for C-025) and Google web client/origins (needed for C-022/C-026 live acceptance). The existing Vercel Gemini key has not yet produced proven provider success; configured is not verified. Do not export existing secrets into local files or evidence. Continue independent implementation while these gates remain open.
