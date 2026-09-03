# C-025 evidence — 2026-09-03

Session context: `live-baseline.md` (earlier this session) confirmed the two concrete production
bugs this card fixes: `pwa-192x192.png`/`pwa-512x512.png` were real JPEGs mislabeled as PNG at the
wrong dimensions, and a stale `public/manifest.webmanifest` diverged from the actual generated
manifest. This session built the entire private photo storage subsystem from scratch (no prior
implementation existed; `/api/photos` was a 503 stub) and fixed both PWA asset bugs.

## What was built

- `supabase/photos.sql`: `sharefridge_private.photo_uploads` tracking table (staged / attached /
  pending_delete / deleted / delete_failed), room-scoped idempotency-key uniqueness.
- `server/photos.js`: strict base64 decode (100KB bound), real magic-byte signature check, real
  `sharp`-based decode/dimension/single-frame validation (≤1280px, rejects animated/multi-frame),
  content-hash idempotency replay, signed-URL batch signing (5 min TTL), bounded cleanup.
- `server/photosRepository.js`: room-advisory-locked attach/release, transactional with the food
  row's own transaction — a photo claim failure rolls back the whole food create/update.
- `server/repository.js`/`apiHandler.js`: `createFood`/`updateFood`/`deleteFood` now
  attach/release photos inside their existing transactions; every food-returning response is
  freshly signed at read time; `photo_url` is never client-settable (`foodDto` now rejects it
  outright — `server/validation.js`).
- Client: `CameraCapture.tsx` rewritten to actually measure and bound the compressed Blob to
  100KB/1024px (was previously an unbounded base64 data-URL with no server round-trip at all);
  `QuickAddModal.tsx` releases an uploaded-but-unsaved photo on cancel; `FoodCard.tsx` shows a
  distinct "photo unavailable" placeholder (`storage_path` set, signing failed) vs. "no photo".
- Real PNG icons regenerated from `public/logo.jpg` via `sharp` (mechanical resize, no AI edit);
  `public/manifest.webmanifest` deleted — `vite.config.ts`'s `VitePWA({ manifest: {...} })` is now
  the single source (the static file was silently overwritten by vite-plugin-pwa at build time
  regardless, so it was already dead weight, just undetected).
- `scripts/backfill-photos.js`: resumable, dry-run-first; only adds `storage_path`, never clears
  the legacy `photo_url` column even after a successful migration.

## What is verified (local, reproducible)

- [Unit/contract tests: 106 passed, 0 failed](unit-tests.log) — `npm test`, including
  `tests/photos.test.js` (14 cases: validation, upload/replay/409, remove, signFoods, cleanup
  shape, and a full HTTP round-trip through a real `createApiHandler` instance) and
  `tests/pwa_assets.test.js` (real PNG bytes/dimensions, single manifest source).
- [Production build: exit 0](build.log) — `npm run build`.
- [PostgreSQL integration (C019 regression): 11 passed, 0 failed](postgres.log) — confirms photo
  attach/release doesn't break the existing durable-storage suite.
- [Photo-specific PostgreSQL integration: 5 passed, 0 failed](photos-postgres.log) — real
  transactions: a bogus `storage_path` rolls back the whole `createFood`; a staged upload can be
  claimed exactly once; replacing a food's photo releases the old path and claims the new one
  atomically (including the found-and-fixed re-save-same-photo idempotency bug); deleting a food
  releases its photo; idempotency keys are room-scoped; `claimCleanup` sweeps a genuinely stale
  staged row.
- `npm run backfill-photos.js` dry run against a disposable local Postgres with a synthetic
  17893-byte legacy `data:` photo correctly reported it would recompress to fit the 100KB bound;
  `--apply` without Storage credentials failed cleanly instead of doing anything.

## Live (see live-2026-09-03.md once run)

Real Supabase Storage bucket `food-photos` (private) confirmed via `storage.listBuckets()`.
`SUPABASE_SERVICE_ROLE_KEY` configured on Vercel Preview and Production. Live upload/attach/view/
cleanup verification follows in a separate evidence file once run against the deployed surface.
