# C-025 real-device confirmation — 2026-09-04

Closes the two "Still open" items left in `live-2026-09-03.md` after the `w-13`/`h-13`
Tailwind fix (commit e2df3ac) landed.

The operator (device owner, testing directly against `https://sharefridge.vercel.app`
Production) re-checked both surfaces on their own phone after the thumbnail-sizing fix
deployed and confirmed, in this session:

- **Food-photo thumbnail**: a real uploaded photo now renders at the intended 52px
  rounded box (previously rendered at full native resolution due to the invalid
  `w-13`/`h-13` classes generating no CSS — see e2df3ac's commit message and diff).
- **PWA home-screen icon**: the app installed to the home screen shows the real
  ShareFridge logo at correct size, not a broken image or the browser's default/generic
  icon.

Both were confirmed correct by direct visual inspection on the operator's own device,
closing out the remaining gap in Verify item 3 (`Upload a real image ... view it on B
through deployed storage; verify private access and install PWA with correct icons`) on
top of the byte-level upload/signed-read proof already in `live-2026-09-03.md` and the
local PNG-magic-bytes/dimensions/manifest-source proof in `unit-tests.log`.
