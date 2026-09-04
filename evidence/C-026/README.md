# C-026 evidence — 2026-09-04

No implementation existed at the start of this session (only the contract amendment
commit `a29a199` had landed; `PATCH /api/auth/session` was still a `503` stub, no
accessibility/mobile-polish work had started). Built the full card scope this session:
real nickname-session renewal server-side, a shared accessible `Dialog` primitive used
by every modal, `ConfirmDialog` for destructive actions, `FoodEditModal` for editable
food fields, and the mobile/accessibility fixes listed in the card's `## Scope`.

## What was built

- `server/apiHandler.js` / `server/security.js`: `PATCH /api/auth/session` now really
  renews the nickname into a freshly signed token, retaining room membership, the
  verified Google profile, and the session's **original** expiry (never extended,
  `generateSessionToken` now takes an optional `exp`). A foreign `room_code` in the
  body is rejected, not silently followed.
- `src/components/Dialog.tsx` (new): shared `role="dialog"`/`aria-modal`, Escape-to-close,
  Tab/Shift+Tab focus trap, focus moved into the panel on open and returned to the
  trigger on close. Adopted by QuickAddModal, RecipeModal, NotificationModal,
  VoiceInputModal, SettingsModal.
- `src/components/ConfirmDialog.tsx` (new): shared destructive-action confirm/cancel
  step with its own pending/error state, used by `FoodCard`'s delete button and the
  consumed-history row's delete button in `App.tsx`.
- `src/components/FoodEditModal.tsx` (new): edits a food's everyday fields
  (name/quantity/compartment/expiry/container_tag); a failed save keeps the modal open
  with the user's edits intact.
- `src/components/FoodCard.tsx`: consume/delete no longer fire-and-silently-swallow
  (`.catch(() => {})` removed in `App.tsx`); pending/disabled states, a real error
  message on failure, edit and delete now open their respective dialogs instead of
  mutating immediately.
- `tailwind.config.js`: filled in the missing palette shades (`fresh-800`, `danger-400`,
  `freezer-300`, etc.) that were already referenced by components and compiling to
  nothing; `src/components/BottomNav.tsx`'s `w-13`/`h-13` (the same invalid-Tailwind-class
  bug C-025 fixed in `FoodCard.tsx`, explicitly flagged there as out of that card's
  allowed files) corrected to `w-[52px]`.
- `src/index.css`: `prefers-reduced-motion` now collapses all animation project-wide;
  `.safe-top`/`.safe-bottom` for notch/home-indicator insets.
- `index.html`: viewport meta no longer sets `user-scalable=no`/`maximum-scale=1.0`
  (pinch-zoom re-enabled).
- Every icon-only button across `Header.tsx`, `BottomNav.tsx`, and the modals now has
  an `aria-label`; touch targets brought to the 44px minimum (`min-w-11 min-h-11`).
- `SettingsModal.tsx`: clipboard copy now `await`s `navigator.clipboard.writeText`
  before showing the copied state, and shows an error instead of a false success on
  rejection; nickname editing has its own pending/error state with non-destructive
  recovery (a failed rename keeps the edit form open with what was typed).
- `QuickAddModal.tsx`: discarding a draft (X / backdrop / Escape) now fully resets
  every field AND releases any staged-but-unattached photo, not just on successful
  save.
- `server/build-openapi.js` / `server/openapi.json`: the `x-availability` "returns 503"
  flag on `/api/auth/session` removed now that the route is real.

## Bug found and fixed mid-session

The subagent that started this card's implementation stalled (timed out) partway
through, mid-edit on `RecipeModal.tsx` (had added the `Dialog` import but not yet wired
it in — `npm run build` failed with an unused-import error). Completed that integration.

Running the test suite afterward surfaced 5 real failures: `Dialog`'s mount effect
touches `document.activeElement`/`document.addEventListener` unconditionally, which
crashes under this project's DOM-less `react-test-renderer` test harness (`node --test`
has no jsdom, so `document` is genuinely undefined in that process — confirmed no other
test file provides one for these tests). Fixed by guarding
`typeof document === 'undefined'` in `Dialog.tsx`'s effect. All 112 tests pass after.

## Local verification

- [Unit/contract tests: 112 passed, 0 failed](tests.log) — `npm test`, including the
  6 new `PATCH /api/auth/session` cases in `tests/session_update.test.js` (renews
  token/nickname, retains Google profile, rejects invalid/oversized/tampered/foreign-room
  input) and the existing suite unaffected.
- [Production build: exit 0](build.log) — `npm run build`.

## Live verification

See `live-2026-09-04.md`. Deployed to Production (with the operator's explicit
approval, given Preview's SSO Deployment Protection blocks a plain browser the same way
it did for C-024) and exercised every interaction listed in the card's Verify items
through the real browser UI.
