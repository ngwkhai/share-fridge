# Playbook: Make GitHub Actions a real release gate, and tag what actually shipped

## When to use this

Use this when a project moves from "deploys by CLI from a laptop" to "main is the release
branch, protected by CI" — creating the remote, turning a workflow file into an enforced
gate, and cutting a release tag you can roll back to.

## Gotcha 1 (the one that breaks people first): `secrets` is NOT available in `if:`

```yaml
- name: Run Playwright tests
  if: ${{ vars.BASE_URL != '' || secrets.BASE_URL != '' }}   # POISONS THE WHOLE FILE
```

The `secrets` context is legal in `env:`, `with:`, and `jobs.<id>.secrets` — **not** in an
`if:` expression. Using it there makes the entire workflow file invalid, and GitHub's
failure mode is uniquely misleading:

- the run appears in the list with `conclusion: failure`
- `total_count` of jobs is **0** — nothing was scheduled
- there are **no annotations** pointing at the offending line
- the only clue is one sentence: "This run likely failed because of a workflow file issue"

It reads like a failing build. Nothing was ever built. Correct form — gate on a repository
variable, take the value from a secret:

```yaml
- name: Run Playwright tests
  if: ${{ vars.BASE_URL != '' }}
  env:
    BASE_URL: ${{ secrets.BASE_URL || vars.BASE_URL }}
```

### Smoke test — run this before trusting any workflow

```sh
gh api repos/<owner>/<repo>/actions/runs/<run_id> --jq '{conclusion, status}'
gh api repos/<owner>/<repo>/actions/runs/<run_id>/jobs --jq '.total_count'
```

`total_count: 0` on a failed run means **the file is invalid**; stop looking at your tests.
A healthy failure always has at least one job with a red step.

## Gotcha 2: a workflow file that has never run is not a gate

A CI workflow committed to a repo with no remote has never executed and cannot. "CI workflow
created" is a true statement about a file and a false statement about the world. Two separate
cards here wrote and edited a `ci.yml` that was structurally invalid the whole time; the defect
was undiscoverable until a remote existed.

Rule: **the done-evidence for CI is a run URL, never a file path.**

## Gotcha 3: branch protection is a billing feature

On a **private** repo on the Free plan, both the classic API and Rulesets return:

```
403 {"message":"Upgrade to GitHub Pro or make this repository public to enable this feature."}
```

So `main` has no hard gate: CI reports, but anyone can push straight past it. Three honest
exits — make the repo public, pay for Pro, or write the exposure into `DEBT.md`. Never assume
protection applied; read it back:

```sh
gh api repos/<owner>/<repo>/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict,
         admins: .enforce_admins.enabled, force: .allow_force_pushes.enabled}'
```

Before flipping a repo public, scan history *and* tracked files — evidence logs are the usual
leak, not source:

```sh
git grep -I -nE '(gho_|ghp_|github_pat_|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|sb_secret_|vercel_blob_rw_|BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})' \
  $(git rev-list --all)
```

## Gotcha 4: prove the gate is a gate

A green pipeline proves CI *runs*. It does not prove CI *blocks*. Spend two minutes:

```sh
git checkout -b ci-gate-proof
# add one deliberately failing assertion
gh pr create --title "DO NOT MERGE - CI gate proof" --body "..."
gh run watch <run_id> --exit-status      # must go RED at the test step
gh pr close <n> --delete-branch
```

Keep the run URL. That URL is the evidence; "the workflow looks right" is not.

## Gotcha 4b: quoting `[skip` `ci]` in a commit message skips your own CI

GitHub Actions honours `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]` and
`[actions skip]` in a commit message for `push` and `pull_request` events. Merely *quoting*
one of those strings — in a commit that documents them, say — silently skips the run.

The failure is quiet and confusing when branch protection is on: the PR shows
`mergeable_state: blocked` for a missing required check that never ran, and nothing explains why.

```sh
gh api "repos/<owner>/<repo>/actions/runs?branch=<branch>" --jq '.total_count'   # 0
gh api repos/<owner>/<repo>/pulls/<n> --jq '{mergeable, mergeable_state}'
```

Never put those strings verbatim in a commit message you do not intend to act on. File
contents are safe — only the commit message is scanned. To recover, push another commit with a
clean message; the `synchronize` event runs CI.

## Gotcha 5: tag the commit the platform actually built

Do not infer the released commit from your own build log. Ask the platform:

```sh
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v13/deployments/<dpl_id>?teamId=<team_id>" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['meta']['gitCommitSha'])"
```

Here the tag was placed one commit late — on the commit that *recorded* the release rather
than the one that *was* the release. Product code was identical, so production was never
wrong, but `git checkout v1.0.0` would not have reproduced the running bundle, which is the
only thing a release tag is for. Verify the difference is genuinely inert before deciding it
does not matter:

```sh
git diff --stat <deployed_sha> <tagged_sha> -- src/ api/ server/ public/ \
  package.json package-lock.json vite.config.ts vercel.json index.html tsconfig.json
```

Also: a release tag lives **inside** main's history, not at its tip. `git tag --points-at main`
is the wrong assertion — it goes false the moment main advances. Use:

```sh
git rev-list -n1 v1.0.0                      # == the deployment's gitCommitSha
git merge-base --is-ancestor v1.0.0 main     # exit 0
```

## Gotcha 6: connecting a Git repo to a host needs the *right* account

`vercel git connect` failed with "You need to add a Login Connection to your GitHub account
first". The real cause was not a missing connection but **two accounts**: the CLI was
authenticated as the account that owns the project (no GitHub link), while the browser was
signed into a different account that had already claimed the GitHub identity. One Git identity
links to one host account, so the identity must be detached from the wrong account first.

Check which account you are actually acting as, on both sides, before believing the error:

```sh
npx vercel whoami
curl -s -H "Authorization: Bearer $TOKEN" https://api.vercel.com/v2/teams/<team_id>/members \
  | python3 -c "import sys,json;[print(m['username'],m['email'],m['role']) for m in json.load(sys.stdin)['members']]"
```

Related: a stored Vercel CLI token carries `expiresAt`, and every call returns
`403 invalidToken` past it. No re-login needed — running any CLI command makes the refresh
token mint a new one and rewrite `auth.json`.

## Provenance

ShareFridge, card C-029, 2026-09-06. Moving `main` to a real release branch: created the
remote, found `ci.yml` had been structurally invalid across two cards, proved the gate red
and green, hit the Free-plan protection wall, and corrected `v1.0.0` after reading the
deployment's own `gitCommitSha`.
