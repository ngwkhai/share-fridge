# C-021 planner review — PARTIAL

2026-09-03. Independent checks: 52 existing unit/client/controller tests passed, 3 revision/RLS PostgreSQL tests passed, 11 persistence PostgreSQL tests passed, 4 client/PostgreSQL tests passed, build passed. Logs are `planner-tests.log`, `planner-postgres.log`, `planner-postgres-regression.log`, `planner-client-postgres.log`, and `planner-build.log`.

Review attempt 1 found that App still displayed empty lists before receiving its first snapshot. A fresh builder corrected the rendering guard and added tests rendering the actual React App. Planner independently reran all 3 new React cases and the final build successfully (`planner-react-review.log`, `planner-final-build.log`). Final diff review passed scope, contract and supported loading/error controls. This brings the tested unit/client/React set to 55 cases.

Actual local browser check on http://127.0.0.1:5173/: expired session returned to login; joined disposable room 644780, added `Món kiểm thử xoá cuối C021`, opened tab B and observed the item. PostgreSQL ID was `3ab740e4-05c9-4955-a203-2255427376c5`, added at 2026-09-03T08:25:28.341Z, expiry 2026-09-06T08:25:28.341Z. Deleted it through tab A's visible trash control, then reloaded B. B showed zero active items and `Cập nhật định kỳ`. Database count by original ID or name remained zero (`planner-browser-db.log`); DOM is in `planner-browser-after-delete.txt`.

The two local tabs share a browser profile and use periodic refresh; they are not two physical devices or hosted Realtime evidence. Hosted Supabase, JWT acceptance, reconnect and measured <500 ms latency remain open. Card stays todo. No production deployment.
