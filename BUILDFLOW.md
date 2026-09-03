# buildflow — a lite harness for end-to-end software development

Idea to **deployed URL**, not idea to paperwork. You walk 11 stages; each stage has an
**output artifact** and a **GATE** — a checklist that must be honestly checked before
you advance. Kill at any gate is a valid, honored outcome.

```
Idea → Research → Scope → PRD → ADR → Contract → Cards → Build → Review → Deploy → Verify-live → Retro
└────────────── planning (files in flow/) ──────────────┘└────── shipping (files in cards/) ──────┘
```

## How to use

1. Run `/flow next` — it unlocks `flow/00-idea.md`. Fill it, check its gate boxes.
2. Run `/flow next` again — it checks the gate. Pass → the next stage template appears in `flow/`. Fail → it tells you exactly what's missing.
3. Repeat through stage 05 (contract). Then `/flow card` creates build cards in `cards/`.
4. Build **one card at a time**. A card is done only when its **done-evidence** is observable in the world (a URL you clicked, real output) — "tests pass" is mid-pipeline, not done.
   The shipping stages (Build → Review → Deploy → Verify-live) live INSIDE each card — its `## Verify` checklist and `## Evidence` section — not as `/flow next` stages.
5. When all cards are done: append one line to `RETRO.md` — *which gate did you skip or rush, and what did it cost?*

## Commands

| Command | What it does |
|---|---|
| `/flow` | Where am I? What's blocking? |
| `/flow next` | Check current gate; unlock next stage |
| `/flow card` | Create the next build card |
| `/flow check C-001` | Validate a card (scope, verify steps, done-evidence) |

## The three rules under everything

1. **Inspect first.** Before planning anything, look at what already exists (competitors, live systems, existing code). Evidence, not vibes.
2. **Contract is the seam.** The API contract (stage 05) is written before any code. Backend builds TO it, UI consumes FROM it. Neither side improvises.
3. **Done = proof in the world.** Every card names its done-evidence up front. You verify on the live URL, as a user.

## Build order inside cards

Contract-first, then ONE thin vertical slice to a deployed URL (one endpoint + one ugly
page that calls it), THEN go wide on backend. UI layer last. The early slice is your
motivation hit and your integration proof.

The standard card sequence (scaffold/CI-CD → slice → backend → contract-tests →
HTML mock → frontend → e2e) and all build-session discipline live in **`CLAUDE.md`** —
auto-loaded into every Claude Code session in this repo, so the rules are in context
exactly when the building happens. Each card = one focused build session; the card is
the session brief, `/flow check` is the exit gate.

---

**Author:** Tony — [arealisticdreamer.com](http://arealisticdreamer.com/)
