# Playbooks — paid-for stack knowledge

One playbook = one stack/integration, written AFTER it worked in a real project
(manual-first: the playbook wraps a successful run, never speculation). They exist so
the next card touching that stack starts from the gotchas instead of rediscovering them.

## Rules

1. **Read before build.** Any card whose scope touches a stack with a playbook here —
   the builder reads the playbook FIRST. In auto runs, the planner includes the relevant
   playbook in the subagent's brief (alongside the card + contract + CLAUDE.md).
2. **Harvest after build.** When a card pays for a non-obvious lesson (a gotcha, a quirk,
   a smoke test that saved the architecture), capture it: update the existing playbook or
   add a new one. The card's review isn't done until the lesson is filed.
3. **Shape:** name `<stack>-<thing>.md`; start with "When to use this"; put the critical
   gotcha at the TOP (the thing that breaks people first); include runnable smoke tests;
   end with provenance (which project, when).
4. **Smoke test before architecture.** If a playbook ships smoke tests, run them BEFORE
   committing to a design that depends on that stack behaving.

## Index

| Playbook | When to use |
|---|---|
| [node-http-body.md](node-http-body.md) | Shared Node/serverless handlers, parsed request bodies and safe JSON errors |
| [postgres-durable-repository.md](postgres-durable-repository.md) | Pooled Node PostgreSQL transactions, repeatable migration and room RLS verification |
