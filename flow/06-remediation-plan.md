# Audit remediation — execution scope, 2026-09-03

Input: audit/2026-09-03/REPORT.md and user authorization to create/execute cards. Preserve existing product scope; repair observed failures. No paid infrastructure creation or destructive migration.

Order: C-018 auth; C-019 PostgreSQL; C-020 client contract; C-021 cache/realtime; C-022 Google; C-023 AI/atomic cook; C-024 Push; C-025 photos/PWA; C-026 UI; C-027 regression gates; C-028 verified deploy.

Architecture amendment: use a durable server-side PostgreSQL repository with Supabase-compatible room isolation, existing HMAC room sessions, supplemental verified Google identity, authenticated realtime and explicit polling degradation. Preserve data; no silent recreation/reseeding. Tests accompany every implementation card. Integration/release depend on all remediation cards.

Shared files force serial build sessions. Planner delegates one agent per card, reviews, reruns verification and records PARTIAL/blocked evidence honestly. Live access and providers remain required for done, even after local tests pass.
