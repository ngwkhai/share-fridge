---
name: contract-check
description: Ad-hoc drift check between flow/05-contract.md and the live /openapi.json — usable any time during backend cards, not just at the contract-test card gate. Use after adding/changing an endpoint, or whenever CLAUDE.md's "swagger lands with the API" rule needs a quick spot-check.
user-invocable: true
allowed-tools: Bash(python3 .claude/skills/contract-check/check_contract.py *)
---

# contract-check — spot-check contract vs runtime

CLAUDE.md requires the planning contract (`flow/05-contract.md`) and the live OpenAPI
spec to never drift, but the only automated enforcement today is
`backend/tests/test_openapi_drift.py`, which compares against a **hand-maintained**
`CONTRACT_ENDPOINTS` list — that list can itself silently drift from
`flow/05-contract.md`. This skill closes that gap by reading the contract file directly.

## What it does

`check_contract.py` regex-parses every markdown table row shaped
`| METHOD | \`/path\` | ... |` anywhere in `flow/05-contract.md` (no hardcoded section
list, so new contract versions/sections are picked up automatically) and diffs the
(method, path) set against a live `/openapi.json`.

## When to run it

- Right after building or changing a backend endpoint, before opening the PR — catches
  drift immediately instead of waiting for the contract-test card.
- Whenever `flow/05-contract.md` gets a new contract version bump (a card touching
  multiple endpoint groups) — confirm every new row actually made it into the running API.
- As a quick sanity check before trusting `test_openapi_drift.py`'s hardcoded list — if
  this skill and that test disagree, `test_openapi_drift.py`'s `CONTRACT_ENDPOINTS` is
  probably the stale one and should be updated to match the contract.

## Usage

```bash
# against local docker-compose api (default http://localhost:8800)
python3 .claude/skills/contract-check/check_contract.py

# against a different port or the deployed URL
python3 .claude/skills/contract-check/check_contract.py http://localhost:5174
python3 .claude/skills/contract-check/check_contract.py https://<live-fly-or-cloud-run-url>
```

Exit code 0 = no drift. Exit code 1 = drift found (printed as two lists: endpoints in the
contract but not live, and endpoints live but not in the contract). Exit code 2 = couldn't
reach the URL — start the api first (`docker compose up -d api` or the local uvicorn run).

## Non-goals

- Does not replace `backend/tests/test_openapi_drift.py` (that test also checks response
  schema shapes, not just method+path presence) or the contract-test card's full suite.
- Does not edit `flow/05-contract.md` or card files — if it finds drift, fix the code or
  amend the contract per CLAUDE.md rule 2 (contract first, then code), it doesn't do that
  for you.
