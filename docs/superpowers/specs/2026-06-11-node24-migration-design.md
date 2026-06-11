# get-changed-files v3 — Node 24 migration

**Date:** 2026-06-11
**Status:** Approved for planning
**Author:** Orest Hazda

## Problem

GitHub Actions is dropping Node 20 as a runtime. Our fork of `get-changed-files` currently declares `runs.using: node20` in `action.yml`, so GitHub shows a deprecation warning in every workflow that uses it. We need a Node 24-compatible build released under a new major version (`v3`) so consumers can opt in one workflow at a time.

## Constraints

- **Drop-in API compatibility.** All inputs (`token`, `format`, `filter`), all outputs (`all`, `added`, `modified`, `removed`, `renamed`, `added_modified`, `added_modified_renamed`, and the legacy `deleted` alias), and observable behavior remain identical to v2.3.0. Consumers can swap `@v2` → `@v3` with no other workflow changes.
- **Per-repo opt-in rollout.** Most consumers pin to `@main` (`webedx-spark/get-changed-files@main`), so the migration must NOT land on `main` until consumers are individually moved off `@main`. The `v3` tag is the opt-in surface.
- **Targeted modernization only.** Upgrade what's required to build and run cleanly on Node 24; do not chase latest on tooling for its own sake.

## Non-goals

- No new inputs or outputs.
- No refactor of filter logic, output formatting, or event handling.
- No package manager change (stay on Yarn).
- No ESLint flat-config migration unless the ESLint bump forces it.
- No floating `v2` safety tag — consumers can pin `v2.3.0` exactly if needed.

## Design

### Branching & release flow

1. Create branch `v3` from current `main`.
2. All migration work lands on `v3` via PR(s).
3. Once CI is green and the action runs end-to-end against itself in CI:
   - Tag `v3.0.0` from the tip of `v3`.
   - Create/move a floating `v3` tag to the same commit.
4. Roll out across consumer repos by changing `@main` → `@v3` one workflow at a time.
5. After all consumer repos are migrated off `@main`, merge `v3` into `main` so `main` consumers also pick up the upgrade.

This preserves the property that `@main` keeps pointing at the current (Node 20) code until rollout completes.

### action.yml

Change the runtime declaration. This single line is what removes the GitHub deprecation warning:

```yaml
runs:
  using: node24   # was: node20
  main: dist/index.js
```

No changes to `inputs`, `outputs`, or `branding`.

### Dependency bumps

| Package | From | To | Reason |
|---|---|---|---|
| `@actions/core` | `^1.10.0` | `^1.11.x` (current) | Current Node 24 compatibility; `getMultilineInput` already supported. |
| `@actions/github` | `^2.1.0` | `^6.x` | v2 is end-of-life. Modern API is `getOctokit()`; v6 supports Node 20+ runtime ABI. |
| `@octokit/rest` (devDep) | `^16.40.2` | Remove if unused after refactor, otherwise current major. | Likely only present transitively via old `@actions/github`. |
| `@types/node` | `^14.17.0` | `^24.x` | Match runtime. |
| `typescript` | `^3.6.4` | `^5.x` | Required to compile against current `@actions/*` types; enables proper `unknown` in catch. |
| `@vercel/ncc` | `^0.34.0` | current | Bundler must understand modern node target. |
| `@typescript-eslint/parser` | `^2.8.0` | bump only as needed to satisfy TS 5 + ESLint | |
| `eslint` | `^6.8.0` | bump only as needed | If forced to v9, accept the flat-config change. |
| `eslint-plugin-*` | as is | bump only as needed | |
| `jest`, `jest-circus`, `ts-jest`, `@types/jest` | `^25.x` | current matching majors | Older Jest may not work under Node 24. |
| `prettier` | `^1.19.1` | `^3.x` | v1 is unmaintained. |
| `rimraf` | `^3.0.0` | current | |
| `minimatch` (runtime) | `^3.0.5` | keep at `^3` unless types change | Behavior we rely on is stable across versions; minor changes in v5+ semantics not worth the risk. |
| `js-yaml` (devDep) | `^3.13.1` | bump only if used | Verify it's actually used; otherwise remove. |

**`package.json` `engines.node`:** `^20` → `^24`.

### src/main.ts changes

Two structural changes, otherwise behavior-preserving:

1. **Octokit API migration.** Replace `import {context, GitHub} from '@actions/github'` + `new GitHub(token)` with the v6 pattern:
   ```ts
   import * as core from '@actions/core'
   import * as github from '@actions/github'
   import minimatch from 'minimatch'

   const client = github.getOctokit(core.getInput('token', {required: true}))
   const {context} = github
   // ...
   const response = await client.rest.repos.compareCommits({base, head, owner, repo})
   ```
   Note the `.rest` namespace. `response.data.files` may be typed as optional in current octokit — add a guard that fails the step with a clear message if absent.

2. **Catch-block typing.** Replace `catch (error) { core.setFailed(error.message) }` with:
   ```ts
   } catch (error) {
     core.setFailed(error instanceof Error ? error.message : String(error))
   }
   ```
   Remove the now-unnecessary `base = ''; head = ''` unreachable assignment block — modern TS narrows correctly when the `setFailed` branch is followed by a `return`. (Add an explicit `return` after `setFailed` in the missing-base/head branch instead.)

3. **`getMultilineInput` already used** — keep as-is. Filter logic untouched.

### CI changes (`.github/workflows/test.yml`)

- `actions/setup-node@v4` `node-version: 20` → `24` (in the `build` job).
- The `test` job uses `./` which executes the action at the declared runtime — it will use Node 24 once `action.yml` is updated. No explicit change needed there.
- The "Check if packaged properly" step stays. The PR will include a freshly-built `dist/index.js` from the upgraded `@vercel/ncc` + new dependencies.

### Tests

`__tests__/main.test.ts` is currently a placeholder (`expect(true).toBeTruthy()`). No mocks to update. Leave as-is — adding real tests is out of scope for this migration.

### README

Update version references from `@v2.3.0` → `@v3` in all usage examples. Leave the upstream `Ana06/get-changed-files` org references alone — that's the public README from the upstream fork and out of scope for this migration.

### dist/

Regenerate `dist/index.js` via `yarn all`. The CI guard ("Check if packaged properly") will fail the PR if this is forgotten.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `@actions/github` v6 API differences beyond the constructor (e.g., compareCommits response shape) break behavior. | Local manual test via CI's `test` job (runs the action against itself). Verify outputs match v2 shape before tagging. |
| `actions/setup-node@v4` may not have `node 24` available in older runner images. | GitHub-hosted `ubuntu-latest` has Node 24 available; if a consumer uses an older self-hosted image, they can stay on `@main` until upgraded. |
| TypeScript 5 strictness flushes out latent bugs in unrelated code paths. | Address only those in `src/main.ts`; do not branch into refactor work. |
| `ncc` bundling changes between major versions produce a very different `dist/index.js` diff. | Expected. Reviewer should check the action *behavior* via CI, not line-by-line diff of `dist/`. |
| Consumer that pins `@v3` then gets a bug fix they didn't want. | Floating `v3` semantics match `v1`/`v2` pattern in this repo — users who want pinning can use `@v3.0.0`. |

## Rollout

Out of scope for this spec — the spec covers only the v3 cut. Per-repo migration (changing `@main` → `@v3` in downstream workflows) happens after `v3.0.0` is tagged and verified.

## Open questions

None. All scope, API, branching, README, and v2-tagging questions were resolved in brainstorming.
