# get-changed-files v3 (Node 24 migration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `get-changed-files` action from Node 20 to Node 24, release as v3 on a dedicated branch so consumers (most of whom pin `@main`) can opt in one repo at a time without breakage.

**Architecture:** All work happens on a `v3` branch off current `main`. `main` is NOT touched. After CI passes end-to-end, tag `v3.0.0` from `v3`'s tip and create/move a floating `v3` tag. Drop-in API compat: identical inputs/outputs/behavior to v2.3.0. Targeted dep modernization only — enough to build cleanly on Node 24, plus the required `@actions/github` v2 → v9 API migration.

**Tech Stack:** Node 24, TypeScript 6, `@actions/core` ^3, `@actions/github` ^9, `@vercel/ncc` ^0.44, ESLint 10 (flat config likely required), Jest 30, Yarn classic.

**Spec:** [docs/superpowers/specs/2026-06-11-node24-migration-design.md](../docs/superpowers/specs/2026-06-11-node24-migration-design.md)

---

## Task 1: Create the v3 branch

**Files:** none

- [ ] **Step 1: Confirm starting branch state**

Run: `git status && git branch --show-current && git log --oneline -1`
Expected: clean working tree, current branch is the working branch off `main` (e.g., `claude/eager-rubin-96463f`), HEAD includes the spec commit `e8516a4`.

- [ ] **Step 2: Create and switch to `v3` branch**

Run: `git checkout -b v3`
Expected: `Switched to a new branch 'v3'`

- [ ] **Step 3: Verify branch**

Run: `git branch --show-current`
Expected: `v3`

Note: We branch from the current worktree's branch (which is itself off `main`). The PR will eventually target `v3` (not `main`) when this work is merged. The user will tag from `v3`'s tip after all of this lands.

---

## Task 2: Upgrade dependencies in `package.json`

**Files:**
- Modify: `package.json`

This is one combined edit because the deps interlock (TypeScript 6 forces newer `@types/*`, ESLint 10 forces newer `@typescript-eslint/*`, etc.) and we want a single `yarn install` to resolve them together.

- [ ] **Step 1: Replace `package.json` with upgraded versions**

Write the file (read first to preserve any fields not shown below):

```json
{
  "name": "get-changed-files",
  "description": "GitHub action that gets all changed files in a pull request or push.",
  "version": "3.0.0",
  "private": true,
  "author": "Jitterbit, Inc.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/jiterbit/get-changed-files.git"
  },
  "homepage": "https://github.com/jitterbit/get-changed-files#readme",
  "bugs": {
    "url": "https://github.com/jitterbit/get-changed-files/issues"
  },
  "keywords": [
    "GitHub",
    "Actions",
    "TypeScript",
    "JavaScript",
    "Get",
    "Changed",
    "Modified",
    "Diff",
    "Files"
  ],
  "main": "lib/main.js",
  "engines": {
    "node": "^24"
  },
  "scripts": {
    "build": "tsc",
    "clean": "rimraf dist/**/* lib/**/*",
    "format": "prettier --write **/*.ts",
    "format:check": "prettier --check **/*.ts",
    "lint": "eslint src/**/*.ts",
    "package": "ncc build",
    "test": "jest",
    "all": "yarn clean && yarn build && yarn format && yarn lint && yarn package && yarn test"
  },
  "dependencies": {
    "@actions/core": "^3.0.1",
    "@actions/github": "^9.1.1",
    "minimatch": "^3.0.5"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "@types/minimatch": "^3.0.4",
    "@types/node": "^24.0.0",
    "@typescript-eslint/eslint-plugin": "^8.61.0",
    "@typescript-eslint/parser": "^8.61.0",
    "@vercel/ncc": "^0.44.0",
    "eslint": "^10.4.1",
    "eslint-plugin-github": "^6.0.0",
    "eslint-plugin-jest": "^29.15.2",
    "eslint-plugin-prettier": "^5.5.6",
    "jest": "^30.4.2",
    "jest-circus": "^30.4.2",
    "prettier": "^3.8.4",
    "rimraf": "^6.1.3",
    "ts-jest": "^29.4.11",
    "typescript": "^6.0.3"
  }
}
```

Notable changes vs. existing:
- `version`: `2.3.0` → `3.0.0`
- `engines.node`: `^20` → `^24`
- `dependencies`: moved `minimatch` from devDependencies to dependencies (it's actually imported in src/main.ts). Removed `@octokit/rest` and `js-yaml` (neither is used in src/ or __tests__/; `js-yaml` is unreferenced and `@octokit/rest` was only there for the legacy `@actions/github` v2). Added `@typescript-eslint/eslint-plugin` (was missing — eslintrc references the plugin without it being declared). Removed the `^24` upper bound on `@types/node` since `~24` is too tight and `^24` allows safe minor bumps.

- [ ] **Step 2: Run `yarn install`**

Run: `yarn install`
Expected: completes without ERR. Warnings about peer deps under ESLint 10 are acceptable as long as install finishes. Note: if `yarn install` produces a `package-lock.json` accidentally, delete it (this project uses `yarn.lock`).

- [ ] **Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "deps: upgrade for node 24 + @actions/github v9

- Bump runtime deps (@actions/core ^3, @actions/github ^9)
- Bump dev toolchain (TypeScript 6, ESLint 10, Jest 30, prettier 3, ncc 0.44)
- Promote minimatch to dependencies (it's actually imported)
- Remove unused devDeps (@octokit/rest, js-yaml)
- Bump package version to 3.0.0
- engines.node ^20 → ^24"
```

---

## Task 3: Update `tsconfig.json` for TypeScript 6

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Replace tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./lib",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "exclude": ["node_modules", "**/*.test.ts", "dist", "lib"]
}
```

Changes:
- `target: es6` → `es2022` (Node 24 supports it; matches modern octokit's output).
- Added `moduleResolution: node` explicitly.
- Added `skipLibCheck: true` — `@octokit/*` types frequently have stale references that aren't worth fighting.
- Added `resolveJsonModule: true` — safe default.
- Added `dist` and `lib` to excludes.

- [ ] **Step 2: Run tsc to confirm it parses**

Run: `yarn build`
Expected: this will likely FAIL with errors from `src/main.ts` (legacy `@actions/github` API). That's expected — Task 5 fixes src/main.ts. Move on.

If it fails with a tsconfig parsing error (not a src error), fix the tsconfig and rerun.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "build: modernize tsconfig for TypeScript 6"
```

---

## Task 4: Migrate ESLint config to flat config

**Files:**
- Create: `eslint.config.js`
- Delete: `.eslintrc.json`
- Modify: `.eslintignore` (delete — replaced by ignores in flat config)

ESLint 9+ requires flat config. The old `.eslintrc.json` will not work.

- [ ] **Step 1: Create `eslint.config.js`**

```js
// @ts-check
const tseslint = require('@typescript-eslint/eslint-plugin')
const tsparser = require('@typescript-eslint/parser')
const jest = require('eslint-plugin-jest')
const prettier = require('eslint-plugin-prettier')

module.exports = [
  {
    ignores: ['dist/**', 'lib/**', 'node_modules/**']
  },
  {
    files: ['src/**/*.ts', '__tests__/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        node: true,
        es2022: true,
        ...jest.environments.globals.globals
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      jest,
      prettier
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/explicit-function-return-type': ['error', {allowExpressions: true}],
      'no-unused-vars': 'off'
    }
  }
]
```

Rationale for trimmed rule set: the original `.eslintrc.json` inherits from `plugin:github/es6`, which has been removed in `eslint-plugin-github` v6 (it migrated to flat config presets with different names). Re-deriving every rule isn't in scope for this migration. The kept rules cover the highest-signal lints; if the team wants the full preset back later, that's a follow-up.

- [ ] **Step 2: Delete `.eslintrc.json` and `.eslintignore`**

```bash
git rm .eslintrc.json .eslintignore
```

- [ ] **Step 3: Run lint to confirm config loads**

Run: `yarn lint`
Expected: lints `src/**/*.ts`. May emit errors against `src/main.ts` (these will be fixed by Task 5). If it errors with "config not found" or "invalid config", fix the eslint.config.js. If `--ext` complaints appear, drop the `--ext` from the lint script (already done — script is `eslint src/**/*.ts`).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "lint: migrate to ESLint 9+ flat config

Replaces .eslintrc.json (no longer supported in ESLint 10). Trims
rule set to high-signal lints since plugin:github/es6 is gone in
eslint-plugin-github v6; team can re-expand if desired."
```

---

## Task 5: Migrate `src/main.ts` to `@actions/github` v9 API

**Files:**
- Modify: `src/main.ts`

The legacy `import {context, GitHub} from '@actions/github'` + `new GitHub(token)` constructor is removed in v3+. The replacement is `github.getOctokit(token)`, and REST methods live under `.rest.*`.

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import * as core from '@actions/core'
import * as github from '@actions/github'
import minimatch from 'minimatch'

type Format = 'space-delimited' | 'csv' | 'json'
type FileStatus = 'added' | 'modified' | 'removed' | 'renamed'

async function run(): Promise<void> {
  try {
    const token = core.getInput('token', {required: true})
    const client = github.getOctokit(token)
    const {context} = github
    const format = core.getInput('format', {required: true}) as Format
    const filter = core.getMultilineInput('filter', {required: true}) || ['*']

    if (format !== 'space-delimited' && format !== 'csv' && format !== 'json') {
      core.setFailed(`Format must be one of 'space-delimited', 'csv', or 'json', got '${format}'.`)
      return
    }

    core.debug(`Payload keys: ${Object.keys(context.payload)}`)

    const eventName = context.eventName
    let base: string | undefined
    let head: string | undefined

    switch (eventName) {
      case 'pull_request_target':
      case 'pull_request':
        base = context.payload.pull_request?.base?.sha
        head = context.payload.pull_request?.head?.sha
        break
      case 'merge_group':
        base = context.payload.merge_group?.base_sha
        head = context.payload.merge_group?.head_sha
        break
      case 'push':
        base = context.payload.before
        head = context.payload.after
        break
      default:
        core.setFailed(
          `This action only supports pull requests and pushes, ${context.eventName} events are not supported. ` +
            "Please submit an issue on this action's GitHub repo if you believe this in correct."
        )
        return
    }

    core.info(`Base commit: ${base}`)
    core.info(`Head commit: ${head}`)

    if (!base || !head) {
      core.setFailed(
        `The base and head commits are missing from the payload for this ${context.eventName} event. ` +
          "Please submit an issue on this action's GitHub repo."
      )
      return
    }

    const response = await client.rest.repos.compareCommits({
      base,
      head,
      owner: context.repo.owner,
      repo: context.repo.repo
    })

    if (response.status !== 200) {
      core.setFailed(
        `The GitHub API for comparing the base and head commits for this ${context.eventName} event returned ${response.status}, expected 200. ` +
          "Please submit an issue on this action's GitHub repo."
      )
      return
    }

    if (!response.data.files) {
      core.setFailed(
        `The GitHub API for comparing the base and head commits for this ${context.eventName} event returned no files. ` +
          "Please submit an issue on this action's GitHub repo."
      )
      return
    }

    const files = response.data.files.filter(file => {
      let match = false
      for (const item of filter) {
        const pattern = item
        core.debug(`Test ${file.filename} against ${pattern}`)
        core.debug(`current match value: ${match}`)
        if (pattern.startsWith('!')) {
          match = match && minimatch(file.filename, pattern, {matchBase: true, dot: true})
        } else {
          match = match || minimatch(file.filename, pattern, {matchBase: true, dot: true})
        }
        core.debug(`match: ${match}`)
      }
      return match
    })

    const all: string[] = [],
      added: string[] = [],
      modified: string[] = [],
      removed: string[] = [],
      renamed: string[] = [],
      addedModified: string[] = [],
      addedModifiedRenamed: string[] = []
    for (const file of files) {
      const filename = file.filename
      if (format === 'space-delimited' && filename.includes(' ')) {
        core.setFailed(
          `One of your files includes a space. Consider using a different output format or removing spaces from your filenames. ` +
            "Please submit an issue on this action's GitHub repo."
        )
      }
      all.push(filename)
      switch (file.status as FileStatus) {
        case 'added':
          added.push(filename)
          addedModified.push(filename)
          addedModifiedRenamed.push(filename)
          break
        case 'modified':
          modified.push(filename)
          addedModified.push(filename)
          addedModifiedRenamed.push(filename)
          break
        case 'removed':
          removed.push(filename)
          break
        case 'renamed':
          renamed.push(filename)
          addedModifiedRenamed.push(filename)
          if (file.patch) {
            modified.push(filename)
            addedModified.push(filename)
          }
          break
        default:
          core.setFailed(
            `One of your files includes an unsupported file status '${file.status}', expected 'added', 'modified', 'removed', or 'renamed'.`
          )
      }
    }

    let allFormatted: string,
      addedFormatted: string,
      modifiedFormatted: string,
      removedFormatted: string,
      renamedFormatted: string,
      addedModifiedFormatted: string,
      addedModifiedRenamedFormatted: string
    switch (format) {
      case 'space-delimited':
        for (const file of all) {
          if (file.includes(' '))
            core.setFailed(
              `One of your files includes a space. Consider using a different output format or removing spaces from your filenames.`
            )
        }
        allFormatted = all.join(' ')
        addedFormatted = added.join(' ')
        modifiedFormatted = modified.join(' ')
        removedFormatted = removed.join(' ')
        renamedFormatted = renamed.join(' ')
        addedModifiedFormatted = addedModified.join(' ')
        addedModifiedRenamedFormatted = addedModifiedRenamed.join(' ')
        break
      case 'csv':
        allFormatted = all.join(',')
        addedFormatted = added.join(',')
        modifiedFormatted = modified.join(',')
        removedFormatted = removed.join(',')
        renamedFormatted = renamed.join(',')
        addedModifiedFormatted = addedModified.join(',')
        addedModifiedRenamedFormatted = addedModifiedRenamed.join(',')
        break
      case 'json':
        allFormatted = JSON.stringify(all)
        addedFormatted = JSON.stringify(added)
        modifiedFormatted = JSON.stringify(modified)
        removedFormatted = JSON.stringify(removed)
        renamedFormatted = JSON.stringify(renamed)
        addedModifiedFormatted = JSON.stringify(addedModified)
        addedModifiedRenamedFormatted = JSON.stringify(addedModifiedRenamed)
        break
    }

    core.info(`All: ${allFormatted}`)
    core.info(`Added: ${addedFormatted}`)
    core.info(`Modified: ${modifiedFormatted}`)
    core.info(`Removed: ${removedFormatted}`)
    core.info(`Renamed: ${renamedFormatted}`)
    core.info(`Added or modified: ${addedModifiedFormatted}`)
    core.info(`Added, modified or renamed: ${addedModifiedRenamedFormatted}`)

    core.setOutput('all', allFormatted)
    core.setOutput('added', addedFormatted)
    core.setOutput('modified', modifiedFormatted)
    core.setOutput('removed', removedFormatted)
    core.setOutput('renamed', renamedFormatted)
    core.setOutput('added_modified', addedModifiedFormatted)
    core.setOutput('added_modified_renamed', addedModifiedRenamedFormatted)

    // For backwards-compatibility
    core.setOutput('deleted', removedFormatted)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

run()
```

Diffs vs. existing src/main.ts:
- `import {context, GitHub} from '@actions/github'` → `import * as github from '@actions/github'`
- `new GitHub(token)` → `github.getOctokit(token)`, `const {context} = github`
- `client.repos.compareCommits` → `client.rest.repos.compareCommits`
- Added `return` after each `setFailed` in the early-exit branches (removes need for the unreachable `base = ''; head = ''` block).
- Added `if (!response.data.files)` guard — typed as optional in v9.
- Typed arrays as `string[] = []` instead of `[] as string[]` (modern style; same semantics).
- `catch (error)` uses `error instanceof Error ? error.message : String(error)`.
- `getMultilineInput` fallback changed from `'*'` (a string) to `['*']` (an array) — the prior code had a type bug where the fallback didn't match the expected `string[]` return type. Behavior is equivalent because `getMultilineInput` already returns `[]` (not falsy `''`) when input is unset with default, so this fallback was previously unreachable.

- [ ] **Step 2: Run `yarn build`**

Run: `yarn build`
Expected: 0 errors. If errors appear, read them carefully — they are most likely:
- "Property 'rest' does not exist": you forgot `.rest.` — add it.
- "Property 'files' is possibly 'undefined'": you removed the guard — restore it.
- "X is declared but never used": delete the unused var.

- [ ] **Step 3: Run `yarn lint`**

Run: `yarn lint`
Expected: 0 errors. Warnings OK.

- [ ] **Step 4: Run `yarn format`**

Run: `yarn format`
Expected: rewrites src/main.ts in place if needed. Diff should be whitespace only.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat!: migrate to @actions/github v9 getOctokit API

Replaces removed v2 constructor with github.getOctokit(). REST methods
now under client.rest.*. Adds error instanceof Error guard for catch.
Adds guard for the now-optional response.data.files. Drop-in compatible:
inputs, outputs, and behavior unchanged."
```

---

## Task 6: Update `action.yml` runtime to node24

**Files:**
- Modify: `action.yml`

- [ ] **Step 1: Change runtime declaration**

Find this block:

```yaml
runs:
  using: node20
  main: dist/index.js
```

Change to:

```yaml
runs:
  using: node24
  main: dist/index.js
```

This is the single line GitHub uses to determine the runtime; changing it eliminates the deprecation warning.

- [ ] **Step 2: Verify nothing else in action.yml changed**

Run: `git diff action.yml`
Expected: only the `node20` → `node24` line.

- [ ] **Step 3: Commit**

```bash
git add action.yml
git commit -m "feat!: declare node24 runtime in action.yml

Removes GitHub's node20 deprecation warning. Consumers using this
action via @v3 (or later, @main once rolled out) will execute under
node 24."
```

---

## Task 7: Update CI workflow to Node 24

**Files:**
- Modify: `.github/workflows/test.yml`

- [ ] **Step 1: Change setup-node version in the `build` job**

Find:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 20
```

Change to:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 24
```

The `test` job in the same file uses `./` to run this action itself, so it picks up the runtime declared in `action.yml` (already set to node24 in Task 6) — no change needed there.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: bump build job to node 24"
```

---

## Task 8: Rebuild `dist/`

**Files:**
- Modify: `dist/index.js` (and possibly add `dist/licenses.txt` if ncc generates it)

The shipped bundle must be regenerated against the new deps and tsc output. This is what consumers actually execute.

- [ ] **Step 1: Run the full pipeline**

Run: `yarn all`
Expected: completes successfully. The sequence is clean → build → format → lint → package → test. If any step fails, fix it before continuing.

- [ ] **Step 2: Verify `dist/` is updated**

Run: `git status dist/`
Expected: `dist/index.js` shows as modified. There may also be a new `dist/licenses.txt` (ncc generates this by default for some dep license combos). Both are expected.

- [ ] **Step 3: Verify the CI guard would pass**

Run: `git diff --name-only && git ls-files --other --exclude-standard`
Expected: any `dist/` entries are about to be staged in the next step. The CI guard checks that there are no UNSTAGED dist/ changes after `yarn all` runs — staging in the next step is fine.

- [ ] **Step 4: Commit**

```bash
git add dist/
git commit -m "build: regenerate dist/ for node 24 + new deps"
```

---

## Task 9: Update README usage examples

**Files:**
- Modify: `README.md`

All usage examples reference `Ana06/get-changed-files@v2.3.0`. Bump version refs to `@v3`. Leave the `Ana06/` org slug alone (this is the upstream README and out of scope per the spec).

- [ ] **Step 1: Replace all `@v2.3.0` references with `@v3`**

Run: `grep -n "@v2.3.0" README.md`
Expected: lists every line that needs change. Then for each occurrence in `README.md`, change `Ana06/get-changed-files@v2.3.0` to `Ana06/get-changed-files@v3`. The exact occurrences (as of current main):
- Line 38 (Usage code block)
- Line 64 (first space-delimited example)
- Line 78 (.php files example)
- Line 94 (yml/exclude example)
- Line 105 (CSV example)
- Line 120 (JSON example)

- [ ] **Step 2: Verify no `@v2` references remain**

Run: `grep -n "@v2" README.md`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: bump usage examples from @v2.3.0 to @v3"
```

---

## Task 10: Push the branch and verify CI

**Files:** none

- [ ] **Step 1: Push the v3 branch**

Run: `git push -u origin v3`
Expected: branch created on origin. Note: this assumes the user has remote write access; if push is rejected, the user needs to handle credentials.

- [ ] **Step 2: Check CI status**

Run: `gh pr create --base main --head v3 --draft --title "v3 (node 24 migration)" --body "$(cat <<'EOF'
## Summary

- Migrate runtime from node 20 → node 24 (removes GitHub deprecation warning)
- Migrate \`@actions/github\` v2 → v9 (getOctokit API)
- Targeted toolchain bumps: TypeScript 6, ESLint 10 (flat config), Jest 30, prettier 3, ncc 0.44
- Drop-in API compat: identical inputs, outputs, and behavior
- Regenerated \`dist/\`
- README usage examples updated to \`@v3\`

## Rollout

This PR targets the \`v3\` branch (not \`main\`). After merge:
1. Tag \`v3.0.0\` from \`v3\` tip
2. Create/move floating \`v3\` tag
3. Migrate consumer workflows from \`@main\` → \`@v3\` one at a time
4. Once all consumers are off \`@main\`, merge \`v3\` into \`main\`

## Test plan

- [ ] CI \`build\` job green (yarn all + dist/ check)
- [ ] CI \`test\` job green (action runs against itself, both with and without filter)
- [ ] Manually verify a few output values from CI logs match v2 shape

Spec: docs/superpowers/specs/2026-06-11-node24-migration-design.md
EOF
)"`

Expected: PR created in draft. The base is `main` because GitHub requires an existing base — the draft PR is for visibility and CI; we will NOT merge it to main yet (see Task 11 / out-of-scope rollout).

If the user prefers not to open a draft PR against main, alternative: `gh workflow run` or just push and inspect CI via `gh run list --branch v3`.

- [ ] **Step 3: Watch CI**

Run: `gh run watch $(gh run list --branch v3 --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: both `build` and `test` jobs pass.

If `test` job fails because the action can't find files or octokit returns 404, the most likely cause is that `dist/index.js` wasn't fully regenerated — re-run Task 8.

If `build` fails the "Check if packaged properly" step, there are uncommitted `dist/` changes — re-run `yarn all`, stage, amend the dist commit, force-push.

- [ ] **Step 4: STOP and report to user**

Do not proceed to Task 11 (tagging) without explicit user approval. Report:
- "CI is green on branch v3. PR (draft): <url>. Ready to tag v3.0.0 + floating v3?"

---

## Task 11: Tag the release (after user approval)

**Files:** none

- [ ] **Step 1: Confirm v3 tip is what you expect**

Run: `git log --oneline v3 -10`
Expected: shows all the commits from Tasks 1-9 + spec commit at the bottom.

- [ ] **Step 2: Tag v3.0.0**

Run: `git tag -a v3.0.0 -m "v3.0.0 - Node 24 migration"`

- [ ] **Step 3: Create floating v3 tag**

Run: `git tag -a v3 -m "Floating v3 tag (currently points at v3.0.0)"`

- [ ] **Step 4: Push tags**

Run: `git push origin v3.0.0 v3`
Expected: both tags appear on origin.

- [ ] **Step 5: Verify tags on GitHub**

Run: `gh release view v3.0.0 || gh api repos/{owner}/{repo}/git/refs/tags/v3.0.0`
Expected: refs exist. (Creating a GitHub Release is optional; the user can do it via the GitHub UI if they want release notes.)

- [ ] **Step 6: Report**

"v3.0.0 and floating v3 tags pushed. Consumers can now opt in via `@v3`. Roll out per-repo by changing `@main` → `@v3` in workflows. Once all consumers are migrated, merge the v3 branch into main."

---

## Self-Review Notes

- All spec sections have corresponding tasks: branching (T1), action.yml (T6), dep bumps (T2), src/main.ts changes (T5), CI changes (T7), README (T9), dist/ (T8), release flow (T1+T10+T11).
- One spec item — "do not merge to main until consumers migrated" — is enforced operationally (Task 10 creates a DRAFT PR with explicit do-not-merge guidance; Task 11 tags from the branch without merging) rather than via a technical block.
- The `js-yaml` and `@octokit/rest` removals are an additional cleanup beyond what the spec described in detail. They're justified (unused) and documented in Task 2's commit message. If the user prefers to keep them, they can edit the commit.
- ESLint flat config migration (Task 4) is more invasive than the spec's "bump only as needed" guidance suggested — but ESLint 10 makes flat config mandatory, so this is forced. The trimmed rule set is the smallest viable replacement; a follow-up task to fully port the github plugin rules would be reasonable.
