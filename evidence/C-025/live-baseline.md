# C025 inspect-before-build — existing production, 2026-09-03

Read-only inspection at 14:41 UTC. This is an existing defect baseline, not acceptance of new code.

- `HEAD https://sharefridge.vercel.app/pwa-192x192.png`: HTTP200, Content-Type image/png, Content-Length576466.
- Downloaded that public asset to a temporary file. `file` reports **JPEG/JFIF, 1024x1024**, not the declared PNG192x192.
- SHA256 `c2fc0accaa997502c9ed1c161a49713ed1e19f6c2d870b6df2317c43d75293dc`, identical to current repository `public/pwa-192x192.png`.
- `HEAD https://sharefridge.vercel.app/sw-push.js`: HTTP200, application/javascript,1008bytes. An independently served file does not prove the active generated worker imports or executes it; C024 verifies that integration.

Production has not been changed. The C025 gate still requires real PNG conversion, one manifest, correct deployed bytes and actual device installation, in addition to private photo storage acceptance.
