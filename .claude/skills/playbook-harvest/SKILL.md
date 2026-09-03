---
name: playbook-harvest
description: Format and file a playbook entry correctly when a card pays for a non-obvious stack lesson, per playbooks/README.md's shape rules. Use at card-done time (before the PR) or during /flow retro's STACK question — reduces the risk of "harvest" being forgotten or filed in the wrong shape.
user-invocable: true
---

# playbook-harvest — file the lesson correctly

`playbooks/README.md` already defines the rule ("the card's review isn't done until the
lesson is filed") and the shape. This skill exists because that rule is easy to satisfy
sloppily — a vague note, no smoke test, no index entry — which makes the playbook useless
to the next card that reads it. This skill does not decide WHETHER to harvest; that's
still the human/planner judgment call at card-done or retro time.

## When to reach for this

- A card just finished and cost real time on a stack gotcha (docker cache, an API quirk,
  an auth flow surprise, a flaky test cause) — before marking the card `done`.
- Answering `/flow retro`'s STACK question ("what non-obvious lesson did a stack make you
  pay for?").
- A card's brief says "touches a stack with a playbook" and, while building, you found the
  existing playbook was wrong, incomplete, or missing a case — update it, don't just note
  it and move on.

## Checklist before filing

1. **Is it actually non-obvious?** "Remember to run migrations" is not a playbook entry —
   it's normal operation. A playbook entry is something that cost a false detour or
   would surprise someone who read the official docs.
2. **New playbook or update existing?** Check `playbooks/README.md`'s index table first —
   if an existing playbook covers the same stack/integration, add a case to it instead of
   creating a near-duplicate file.
3. **Shape (new file):**
   - Filename: `<stack>-<thing>.md` (e.g. `docker-deploy-stale-cache.md`).
   - `# Playbook: <one-line name>`
   - `## When to use this` — the trigger condition, one paragraph.
   - The gotcha itself **at the top**, before any fix — lead with what breaks people
     first, not the solution.
   - `## Fixes` (or equivalent) — ranked by preference, most-durable first.
   - `## Smoke test` — a runnable command/snippet that would have caught this before
     committing to the design, not just a manual repro after the fact.
   - Footer: `*Provenance: <project/card>, <YYYY-MM> — <rough cost, e.g. "2 false
     detours">.*`
4. **Update the index** — add (or edit) the row in `playbooks/README.md`'s `## Index`
   table: `| [file.md](file.md) | one-line "when to use" summary |`.
5. **Cross-check `DEBT.md`** — if the lesson reveals a debt was taken deliberately (not
   just a gotcha but an accepted gap), that's a `DEBT.md` line, not a playbook entry —
   they're different files for different purposes. A playbook is "how to avoid the
   pothole"; a debt line is "we drove around the pothole on purpose, here's when to fill
   it in."

## Non-goals

- Does not touch card `status` or `## Evidence` — filing the playbook is a prerequisite
  the human/planner checks before calling the card done, not something that marks it done.
- Does not write to `RETRO.md` or `FLOW-FEEDBACK.md` — those are the other two `/flow
  retro` routes (process lesson, buildflow-itself lesson), handled by the `flow` skill.
