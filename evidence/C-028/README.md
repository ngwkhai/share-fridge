# C-028 Evidence — Verification of Remediation Release on Existing Deployment (2026-09-04)

## Production Deployment Details

- **Project**: `sharefridge` (`khaindhrt-9606s-projects/sharefridge`)
- **Deployment ID**: `dpl_Apfbe52eAZuEBoNqyF1pU3ANAyRV`
- **Target**: Production
- **Alias URL**: `https://sharefridge.vercel.app`
- **Direct Deployment URL**: `https://sharefridge-em1oyxal3-khaindhrt-9606s-projects.vercel.app`
- **Deployed Commit**: `2ad793e` (including cards C-018 through C-027)
- **Deployment Duration**: 20s, ReadyState `READY`

## Verified Production Capabilities

1. **System & Database Readiness**:
   - `GET /healthz`: `200 OK`, version `1.0.0`, timestamp verified.
   - `GET /readyz`: `200 OK`, `status: "ok"`, `database: "postgres"`.
   - `GET /api/openapi.json`: `200 OK`, OpenAPI 3.0.0 specification serving 25 endpoints.
   - `GET /api/config`: `200 OK`, Google Client ID configured, capabilities: `{ google: true, push: true, photos: true, realtime: true }`.

2. **Core Security & Multi-User Isolation**:
   - Room creation (`POST /api/auth/create-room`): 201 Created with hashed passcode and signed session Bearer token.
   - Room join (`POST /api/auth/join-room`): 200 OK with passcode verification.
   - Bearer token authentication required on all data endpoints; missing token yields 401 `UNAUTHORIZED`.
   - Cross-room boundary isolation enforced; accessing foreign room items yields 403 `FORBIDDEN`.

3. **Live Inventory CRUD & Batch Actions**:
   - Food addition (`POST /api/foods`): 201 Created, durable storage in hosted PostgreSQL.
   - Single item consume (`PATCH /api/foods/:id/consume`): transitions status to `CONSUMED`, atomically appends item to room shopping list.
   - Shopping item CRUD: verified query and deletion.

4. **Live AI Integration (Gemini 3.1 Flash-Lite)**:
   - Voice parsing (`POST /api/ai/parse-voice`): 200 OK, `source: "gemini-3.1-flash-lite"`, confidence 0.98 for Vietnamese input.
   - Recipe suggestion (`POST /api/ai/suggest-recipes`): 200 OK, returns contextual recipe from live inventory items.

5. **Rollback Procedure**:
   - In Vercel dashboard or CLI: `vercel rollback https://sharefridge.vercel.app` or re-alias to previous deployment `dpl_6xsRDJERRVmjrWdoWLLS1pdJu5DG`.
   - Database schema uses additive migrations and transactional locking; no destructive drops performed.

## Evidence Artifacts

- [Live production verification log](./live-verification.log) (`scripts/verify-c028.js`)
- [Deployment inspect log](./deployment-inspect.log) (`vercel inspect`)
