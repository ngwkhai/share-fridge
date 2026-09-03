---
name: debugging
description: Systematic root-cause debugging for this project. Use when a card's Verify step fails, a test flakes, or a bug shows up mid-build. Not a planning or gate tool — it never touches card status, allowed-files, or flow.sh state; those stay owned by the `flow` skill.
user-invocable: true
---

# Debugging — root cause, not guesswork

This skill governs HOW you debug inside a card's scope. It never decides WHAT to build or
WHEN a card is done — `flow` owns that. Use this whenever a `## Verify` step fails, a test
flakes, or something breaks that wasn't in the original bug report.

## The 4 phases

1. **Reproduce first.** Never patch code from a guess. Get a command that fails
   reliably (a specific test invocation, a specific curl, a specific browser/e2e spec).
   If it only fails sometimes, that's a signal — go to "Flaky failures" below before
   touching code.
2. **Isolate.** Bisect the failure to the smallest unit: which layer (DB row, adapter,
   endpoint, frontend fetch, e2e assertion)? Read the actual error/stack trace fully —
   don't pattern-match on the first line. For API bugs, curl the endpoint directly before
   suspecting the frontend. For DB bugs, query the database directly before suspecting
   the ORM layer.
3. **Hypothesize, then test the hypothesis** — don't test the fix. Before editing code,
   state in one sentence why you think it's failing, and how you'd know if you're wrong.
   If you can't state that sentence, you're not ready to edit yet.
4. **Fix, then re-run the ORIGINAL reproduction** (not a narrower one you invented while
   fixing) plus the full test file/spec to check for regressions.

## Flaky failures

`[FILL: this project's own flaky-failure patterns, once the stack is chosen — e.g.
container/DB startup races, async timing, shared test fixtures]`

General pattern regardless of stack: most flakiness is a race, not a Heisenbug.
- **Condition-based waiting, never fixed sleeps.** Poll the actual condition (a health
  check, a specific DOM element, a specific process state) with a timeout loop, instead
  of `sleep N` and hoping.
- **Reproduce the race deliberately.** Run the failing test in a tight loop to confirm a
  fix actually closes the race rather than just getting lucky once.
- **Check for shared state leaking between tests** (fixtures, DB not reset between tests)
  before suspecting the app code itself.

## Defense-in-depth

When a bug reaches production/staging despite tests, don't fix it in one place only — ask
where else the same bad input could enter (another endpoint sharing the same validator,
the admin path bypassing user-facing checks). Add the check at the boundary it actually
belongs to (validate at system boundaries), not just at the spot that happened to crash.

## When the fix reveals a contract or design gap

If root-causing shows the bug is actually a wrong contract shape or a design violation —
stop and amend `flow/05-contract.md` or flag the `DESIGN.md` conflict FIRST (per CLAUDE.md
rule 2). Don't quietly patch around a wrong contract.

## Non-goals

- Does not write to card files, `AUTO-LOG.md`, or `DEBT.md` — if a bug forces a scope or
  contract change, that's the `flow` skill's job to record.
- Does not replace `## Verify` in a card — once root-caused and fixed, still run the
  card's actual Verify steps for real evidence.
