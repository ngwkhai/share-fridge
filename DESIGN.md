# Design law — buildflow projects

This file is LAW for every UI card in this project — the UI mock card and every
frontend card MUST be built and reviewed against it. If a change conflicts with a rule
here, the rule wins (or the rule is changed deliberately, in this file, with a dated note).

Two layers, treat them differently:
- **Structure is law**: the affordance ladder, object-first pattern, forms rules, and the
  never-do list apply to any product. Don't relitigate these per project.
- **Tokens are taste**: colors, fonts, gradients, motion are one project's chosen look.
  Fill them in once, deliberately, all at once — never ad-hoc per component.

## North Star

**Simple stupid UI for non-technical users; full power kept available — but never in the way.**

Users think in *their* objects (e.g. "my workshop", "my ticket", "my booking") — never in
engine concepts. Engine words (workflow, trigger, action, job, queue, webhook, agent,
prompt…) NEVER appear in user-facing copy. Define this project's vocabulary in the
table below and use it everywhere.

### Project vocabulary (fill per project — strings, never code paths)

| Engine concept | This project's user word |
|---|---|
| Food item / record | Món đồ / Thực phẩm |
| Expiry status / TTL calculation | Hạn dùng / Mức độ tươi (Nấu gấp, Còn tươi, Hết hạn) |
| Storage compartment / zone | Vị trí (Ngăn đông, Ngăn mát trên, Ngăn mát dưới, Hộc rau, Cánh tủ) |
| Container / visual identifier | Dấu hiệu nhận biết (Hộp xanh, Túi zip, Túi nilon đỏ, Dán nhãn...) |
| Workspace / fridge room profile | Tủ đồ phòng mình |
| Roommate / user entity | Bạn cùng phòng |
| Consume action / soft delete | Đã nấu / Đã dùng xong |
| Fast input preset | Chọn nhanh (< 5s) |

## Five rules that override everything

1. **Object-first, not feature-first.** The home page of a thing IS the thing. Tabs are
   lenses on the same object — the user never navigates "out" to reach something related.
2. **WYSIWYG, edited in place.** The daily 80% of edits happen inline on the object's own
   page (see the affordance ladder). A separate Edit page exists only for the structural 20%.
3. **Defaults beat configuration.** Creatable in ≤6 visible fields; everything else behind
   one "More options" disclosure. If a default serves 80%, ship it and demote the toggle.
4. **Plain language beats power syntax.** "4 days after it ends" — never cron. A field-picker
   chip — never `{{ raw.templates }}`. No JSON in any simple surface.
5. **Power behind a door.** If a power surface exists, it's a `Simple | Pro` toggle that
   never loses data, plus a visible "switch to simple" path back. 95% never flip it.

## Edit-affordance ladder (inline ↔ popup is a spectrum, not a switch)

Choose by the field's SEMANTIC SHAPE — always the lightest rung the shape allows.
Decision rule: count the inputs the user must touch to finish the edit.

| Rung | Field shape | Interaction |
|---|---|---|
| 1. Inline text | one free-text value | click → input in place → save on blur/Enter (optimistic) |
| 2. Inline control | one value, known set/format | click → the right native control in place (date picker, stepper, select) |
| 3. Popover composite | ONE displayed line composed of 2–4 sub-choices | click → popover anchored to the field, type-switch + matching input → "Done" writes one line |
| 4. Modal | a multi-field object, or a collection | "+ Add" / "Edit" → centered dialog with all fields |

- Popover edits **one display value**, dims nothing. Modal edits **an object or list**, dims the page.
  Finishing produces one chip → popover. A new row in a list → modal. Never swap them.
- Inline-editable fields: text by default; hover reveals dotted underline + a 12px pencil;
  click becomes the right affordance.
- **Empty state rides the same ladder**: a missing value renders as a dashed `+ Add {label}`
  that opens its own rung. No field is ever a dead-end.

## Object page pattern (the Luma pattern)

Every object-detail page:
- **Pulse strip** — at-a-glance metrics inline (calm, no stat-tile cards, no shadows).
- **Up to 3 hero action cards** — the top things a user does on this object. Big targets,
  gradient-tinted, one click. NOT a kebab menu.
- **Tabs as lenses** — all on the same object. Active tab: 2px bottom border in the
  project's base text color.
- **Modal-first sub-actions** — small focused modals, one CTA. No multi-screen flows.
- **The overview shows less, not more.** Heavy lifting goes to specialized tabs.

## Design tokens (Dated: 2026-09-02 — "Fresh & Fast" Mobile Token Set)

- **Canvas & Background:**
  - Base canvas: `#F8FAFC` (Slate-50)
  - Card / Sheet surface: `#FFFFFF` (Pure white)
  - Elevated modal surface: `#FFFFFF` with `box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08)`
  - Border color: `#E2E8F0` (Slate-200, 1px crisp stroke)

- **Semantic Color Palette:**
  - **Brand Primary (Freshness):** Emerald `#059669` (Dark), `#10B981` (Main), `#D1FAE5` (Light tint)
  - **Warning (Cook Soon / Cần nấu gấp - ≤ 2 ngày):** Amber `#D97706` (Dark), `#F59E0B` (Main), `#FEF3C7` (Light tint)
  - **Danger (Expired / Quá hạn):** Rose `#DC2626` (Dark), `#EF4444` (Main), `#FEE2E2` (Light tint)
  - **Freezer / Ngăn đông:** Sky `#0284C7` (Dark), `#0EA5E9` (Main), `#E0F2FE` (Light tint)
  - **Pantry / Đồ khô:** Warm `#854D0E` (Dark), `#CA8A04` (Main), `#FEF9C3` (Light tint)

- **Foreground & Typography:**
  - Font family: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif`
  - Primary text: `#0F172A` (Slate-900)
  - Secondary / Muted text: `#64748B` (Slate-500)
  - Chip text / Meta: `#475569` (Slate-600)
  - Large count / Days remaining: Bold tabular numerals (`font-bold font-mono`)

- **Radius Scale:**
  - Cards & Sheet containers: `14px` (`rounded-2xl`)
  - Buttons, inputs & selectors: `10px` (`rounded-xl`)
  - Badges, status pills & filter chips: `9999px` (`rounded-full`)

- **Borders & Elevation:**
  - Card border: `1px solid #E2E8F0`
  - Active / Focus ring: `2px solid #10B981` (Emerald-500)
  - Sticky bottom action bar: `backdrop-filter: blur(12px); background: rgba(255, 255, 255, 0.85); border-top: 1px solid #E2E8F0`

- **Motion & Transitions:**
  - Duration: `150ms - 200ms cubic-bezier(0.16, 1, 0.3, 1)`
  - Quick feedback for tap/touch (haptic-like visual scale `active:scale-98`)
  - Respect `prefers-reduced-motion` everywhere.

## Forms

- Max 6 visible fields on any create/edit page; more → disclosure.
- One column, max-width 640px for focused forms. No multi-step wizards for editing.
- Sticky savebar with a clear top border; optional accent strip.
- Labels small/medium-weight/muted color. Inputs comfortably tall, 1px border, accent focus ring.

## Iconography

Stroke line icons (Heroicons/Lucide style), stroke-width 1.6–2, no fill.
**No emojis. Anywhere. Ever.** Use SVGs.

## What to never do

- Never leak engine words into user-facing copy (see vocabulary table).
- Never show raw `{{ }}` templates or JSON outside a power-user surface.
- Never use multi-step wizards for editing.
- Never let decorative treatment (gradients/glow/shadow) drop readability — text must stay
  readable against whatever canvas/surface treatment this project's tokens define.
- Never pile every possible decorative effect onto every element — depth/motion belongs to
  the specific surfaces the tokens name, never to inputs, rows, or body text by default.
- Never ship motion that ignores `prefers-reduced-motion`.
- **Never add emojis. Anywhere. Ever.** Use SVG line icons. Never write design comments in HTML.

## How this binds the cards

- The **UI mock card** renders these tokens/patterns in static HTML — the mock IS the
  design review; the operator approves against this file.
- Every **frontend card**'s review checks the diff against this file the same way it
  checks shapes against `flow/05-contract.md`. DESIGN.md is to pixels what the contract
  is to shapes.
