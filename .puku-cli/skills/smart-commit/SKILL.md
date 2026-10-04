---
name: smart-commit
description: Draft a Conventional Commits message from staged/unstaged changes, with CityFix Bolt-slug discipline when applicable.
allowed-tools:
  - Bash(git:*)
  - Read
when_to_use: Use when the user wants to commit, write a commit message, run a smart commit / conventional commit, or commit Bolt work. Trigger phrases: "commit this", "write a commit message", "smart commit", "conventional commit", "format this commit", "commit the bolt", "bolt commit", "wrap this up into a commit", and any other commit-related work.
argument-hint: "[<bolt-slug>] [<type>] [<message-hint>...]"
arguments:
  - bolt-slug
  - type
  - message-hint
context: inline
---

# smart-commit

Draft a well-structured commit message from local changes and (optionally)
create the commit on the user's confirmation. Combines Conventional Commits
discipline (type/scope + subject + body + trailers) with CityFix Bolt-slug
convention (slug-as-subject, source-branch Bolt history preserved).

## Inputs

- `$1` (`<bolt-slug>`): optional. If provided, used as the commit subject
  verbatim. If absent, inferred from a `bolt/<slug>` branch name; otherwise
  derived by the type/scope path in Step 3.
- `$2` (`<type>`): optional. Override for the Conventional Commits type
  (feat / fix / refactor / chore / docs / test / build / ci / perf).
- `$3+` (`<message-hint>`): optional prose the user wants the body to
  capture (e.g. "fixes OTEL span on auth refresh"). Joined with spaces.

## Goal

Produce a commit message which (i) follows Conventional Commits 1.0.0, (ii)
respects CityFix Bolt-slug discipline when applicable, (iii) is created
only after the user has reviewed and approved the draft, and (iv) never
silently stages or pushes.

## Steps

### 1. Inspect changes

Run `git rev-parse --abbrev-ref HEAD` for the branch, `git status --porcelain`
for the working-tree state, and `git diff --staged --stat` + `git diff --staged`
for staged content. If nothing is staged, fall back to `git diff --stat` +
`git diff` and note this in the draft ("unstaged-only"). Identify untracked
files and surface them separately — never include them in the proposed commit.

Detect a Bolt slug: if the branch matches `bolt/<slug>`, capture `<slug>`.
Also detect any file in the staged/unstaged set whose path matches a secret
pattern (`.env`, `.env.*`, `*.pem`, `*.key`, `credentials.json`, `secrets/`,
`id_rsa`, `*.p12`) and surface a hard refusal; do not propose a commit that
includes them.

**Success criteria**: `git status` + diff read, staged vs unstaged counted,
untracked flagged, secret-pattern check passed (or refused), branch and
Bolt slug (if any) recorded for Step 3.

**Artifacts**: branch name, Bolt slug (or null), staged file list, unstaged
file list, untracked file list, secret-pattern matches (or "none").

### 2. Classify and derive type/scope

Derive `type` from file paths using a deterministic heuristic:
- `docs/**` or `*.md` only → `docs`
- `tests/**` or `*.spec.{ts,tsx}` or `*.test.{ts,tsx}` → `test`
- `.github/**`, `Dockerfile`, `docker-compose*.yml`, `.devcontainer/**` → `build` or `ci` (default `ci` if workflow files only)
- deletion-only changeset → `chore`
- changes only in `aidlc/**` state/audit shards → `chore`
- `lib/**` bug-shaped (no new exports, only patches) → `fix`
- `lib/**` new exports or new files → `feat`
- otherwise → `feat`

Derive `scope` from the top-level directory of the dominant change
(`lib`, `app`, `tests`, `design-artifacts`, `aidlc`, `scripts`, `docs`).
If multiple top-level dirs are present, pick the dominant one and add a
"others:" bullet in the body.

If type is ambiguous (no single dominant shape), pause and ask the user
to confirm the type via AskUserQuestion (A–D + Other). If `$2` is set,
override the inferred type with `$2`.

**Success criteria**: type and scope decided; if ambiguous and `$2` is
absent, user has confirmed.

**Artifacts**: `type`, `scope`.

**Human checkpoint**: pause for type confirmation when ambiguous.

### 3. Draft subject + body

Subject:
- If a Bolt slug is present (from branch or `$1`), the subject is the slug
  verbatim (e.g. `261004-wo-001-bolt-cg-auth-flow`). No type/scope prefix.
- Otherwise, `type(scope): <subject>` where `<subject>` is imperative,
  no trailing period, total length ≤ 72 chars.

Body:
- Blank line after subject.
- First paragraph (1–2 sentences, ≤ 72 cols each): what changed.
- Second paragraph (1–2 sentences, ≤ 72 cols each): why — user-facing or
  business reason, not implementation detail. If `$3+` was provided,
  weave the hint in here.
- Bullet list (≤ 6 bullets, ≤ 72 chars each, present tense) of salient
  file-level changes. Skip if the diff is trivial (≤ 3 files, no rename).
- Wrap at 72 cols. Trim trailing whitespace.

Trailer:
- Always append a blank line, then `Co-Authored-By: Opus 4.8 <noreply@puku.sh>`.

**Success criteria**: full message drafted in memory; subject ≤ 72 chars;
no trailing period on subject; body has at least one explanatory line;
trailer present; total length sane (typically ≤ 1500 chars).

**Artifacts**: full commit message string.

### 4. Confirm, stage, commit

Show the draft in a fenced block. Ask the user to confirm (Approve / Edit
subject / Edit body / Abort). On Approve:
- Default: stage only the files that are already staged + any specific
  files the user names in the confirmation.
- `git add -A` and `git add .` are FORBIDDEN.
- Use `git commit -F-` with a HEREDOC body for safe multi-line messages.
- Refuse `--no-verify` and `--amend` unless the user explicitly asks.
- Refuse `git push` unless explicitly requested; if asked, push to
  `origin <current-branch>` (CityFix trunk is `prd-development`, not
  `main`).
- After commit, run `git log -1 --stat` to confirm.

Pre-commit guard checks before commit:
- Any staged file matches secret pattern → ABORT with the offending
  paths.
- Untracked files that look related to the staged change → warn, ask.
- Diff contains deletion of `aidlc-state.md` or anything under
  `documentkb/` → ABORT (project.md Forbidden).
- Pre-commit hook bypass requested via `--no-verify` → warn and ask.

**Success criteria**: commit created with the drafted message; user has
seen the final `git log -1 --stat` output; nothing pushed without an
explicit request.

**Human checkpoint**: confirmation gate before `git add` / `git commit`.

## Rules

- NEVER run `git add -A` or `git add .` — stage only named files.
- NEVER use `--no-verify` or `--amend` unless the user explicitly asks.
- NEVER commit files matching secret patterns (`.env`, `.env.*`,
  `*.pem`, `*.key`, `credentials.json`, `secrets/`, `id_rsa`, `*.p12`).
- NEVER delete or modify `aidlc-state.md` or `documentkb/**` in a commit.
- NEVER push without an explicit request; default push target is
  `origin <current-branch>` (CityFix trunk is `prd-development`).
- ALWAYS show the draft before staging or committing.
- ALWAYS include the `Co-Authored-By: Opus 4.8 <noreply@puku.sh>` trailer.
- ALWAYS run `git log -1 --stat` after the commit so the user can see
  the result.
- ALWAYS wrap body lines at 72 cols and trim trailing whitespace.
- If a Bolt slug is present, use it as the commit subject verbatim —
  do not add a type/scope prefix.
