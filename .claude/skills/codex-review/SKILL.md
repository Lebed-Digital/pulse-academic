---
name: codex-review
description: Codex Review. Read-only second opinion from the Codex CLI (gpt-6.1-sol, read-only sandbox) in two modes. Plan mode reviews an implementation plan against the real repo before any code is written. Diff mode reviews the current change before it is committed. Claude judges every finding (ACCEPT / PARTIALLY ACCEPT / REJECT), revises the plan or fixes the code, and runs one Codex verification pass. Two Codex passes maximum per mode. Use when Greg types /codex-review, asks for a Codex review or "the Codex review loop", or when CLAUDE.md's Codex Review Policy calls for one. Never commits, pushes, deploys, or touches Supabase.
---

# Codex Review

Codex finds, Claude decides. Codex is a reviewer only. Claude is the only
agent that edits anything. A Codex finding is a claim to verify against the
code, not an instruction to follow.

- `/codex-review plan <plan file>`: review an implementation plan before coding.
- `/codex-review` or `/codex-review diff [paths or base ref]`: review the
  current change after implementing it.

## Non-negotiable rules

- **Never** commit, push, merge, open a PR, or deploy (`vercel` in any form)
  inside this skill. Revisions and fixes stay in the working tree. When the
  report is done, control returns to the task that invoked this skill; if
  Greg invoked it directly, stop at the report.
- **Never touch production:** no Supabase SQL, writes, or migrations, no
  `.env*` edits, no Vercel changes.
- **No destructive operations:** no `git reset`, `checkout --`, `restore`,
  `stash`, `clean`, `rebase`, branch deletion, or file deletion.
- **Every Codex call is exactly the command below**, with
  `-m gpt-6.1-sol -s read-only`. Never `workspace-write`,
  `danger-full-access`, `--dangerously-*`, `--approve-for-me`, `--worktree`,
  or `--add-dir`. If the model or sandbox fails, stop and report. Never fall
  back to another model.
- **Two Codex passes maximum per mode.** Never a third.
- **Nothing sensitive goes to Codex:** no `.env*` contents (the repo root has
  `.env.local`), keys, tokens, or real student, teacher, or class data
  (exports, query results, screenshots). Inputs hold plan text, diffs, and
  file paths only. If a diff would include any of that, stop and ask Greg.

## The Codex command

From the repo root, Bash tool, 600000 ms timeout:

```bash
mkdir -p .codex-review
codex exec -m gpt-6.1-sol -s read-only -o ".codex-review/<name>.md" - < ".codex-review/<name>-input.md" > ".codex-review/<name>.log" 2>&1
```

- `.codex-review/` is gitignored. Every review artifact goes there and is
  never committed.
- `<name>` is `<slug>-plan-pass1`, `<slug>-plan-pass2`, `<slug>-diff-pass1`,
  or `<slug>-diff-pass2`. `<slug>` is the plan's file name, or a short kebab
  name for the change. A rerun overwrites files of the same name.
- Read only `<name>.md`, Codex's final message. The `.log` is the raw
  transcript, for diagnosing failures. Never paste it into the conversation.
- `-s read-only` is the boundary: Codex can read the repo and run read-only
  commands, nothing that writes. The `-o` file is written by the CLI, not by
  the sandboxed agent.

Every `codex exec` is a new session with no memory of an earlier one, so
every input file must stand alone.

## Shared rules (pasted into every Codex input, in full)

> You are a read-only reviewer for the Pulse Academic repository (React 19,
> TypeScript, Vite, Supabase). Claude is the implementing agent and the only
> one that edits. Do not create, edit, or delete files. Do not run builds,
> tests, installs, git commands that write, or anything that touches the
> network or a database. Do not open `.env*` files or print secrets. Do not
> quote student, teacher, or class data values.
>
> Project rules are in CLAUDE.md. Its "Current redesign direction" section
> overrides the Brain documents where they conflict. Product context is in
> `Brain/Pulse Academic Core Redesign Plan.md` and
> `Brain/Pulse Academic Simplification Audit.md`. Read the parts relevant to
> your findings, not the whole set.
>
> Data safety, applies to every finding:
> - Existing historical assessment data must be preserved and stay readable.
>   Flag anything that deletes, overwrites, merges, or reinterprets existing
>   rows, including upserts whose conflict key can hit old rows.
> - Do not recommend a destructive migration (DROP, TRUNCATE, dropping or
>   retyping a populated column, bulk UPDATE or DELETE of existing rows)
>   unless no additive option exists, and say so explicitly if you do.
> - The repo has no migration catalog (`supabase/` holds only edge
>   functions), so live schema, constraints, grants, and RLS are unverified.
>   Flag any step that relies on a schema assumption without saying how it
>   will be verified first.
> - Any new table in `public` needs explicit GRANTs to `authenticated` and
>   `service_role`, plus RLS enabled. Flag it if either is missing.
> - Old and new data paths must not silently overwrite each other, for
>   example a new write path reusing an old upsert key, or legacy code
>   reading new rows as if they were old ones.

## Plan mode

### Step P1: The plan file

1. Codex reviews files, not chat. The plan lives at `plans/<slug>.md`
   (create `plans/` on first use). Write it there before review.
2. The plan states: the goal, files to touch, data and persistence changes
   (or "none"), what must stay unchanged, how it will be tested, and, if it
   touches the redesign, how it fits CLAUDE.md "Current redesign direction".
3. No secrets or real data in the plan.

### Step P2: Codex plan pass 1

Input file `.codex-review/<slug>-plan-pass1-input.md`, in this order: the
shared rules, the plan review rules below, the plan's path, then the full
plan text in a fenced block.

Plan review rules:

> Review the implementation plan below against the actual repository. Verify
> its assumptions by reading the code it names and the code that calls it.
> Look for:
> - assumptions that are false in the current code
> - missed dependencies: callers, shared state, demo mode (`isDemo`), other
>   screens that read the same data
> - persistence and data risks (see the data safety rules)
> - regressions to existing behavior
> - unnecessary complexity, or scope broader than the goal needs
> - conflicts with the existing architecture or with CLAUDE.md "Current
>   redesign direction"
> - anything that must be tested or verified before implementation starts
>
> Do not rewrite the plan and do not report wording or style preferences.
> Report only findings that would change what gets built, the order it is
> built in, or what gets verified first.
>
> Group findings under these headings, omitting empty ones:
> BLOCKER: as written, the plan would lose data, break existing behavior, or cannot work.
> IMPORTANT: a real risk or gap to fix in the plan before coding.
> NICE TO HAVE: a worthwhile improvement that is safe to skip.
>
> For each finding use exactly this format:
> FINDING <n>
> Issue: <one or two sentences>
> Why it matters: <the concrete consequence>
> Evidence: <path:line and what the code does there>
> Recommended correction: <one or two sentences>
>
> No numerical scores. If there are no meaningful issues, reply with exactly:
> NO_MEANINGFUL_ISSUES

Run the command with `<name>` = `<slug>-plan-pass1`. If the reply is
`NO_MEANINGFUL_ISSUES`, the plan survived: go to Step P5. No second pass.

### Step P3: Judge each finding, revise the plan

For every finding, read the cited code yourself, then decide:

- **ACCEPT:** real. Change the plan.
- **PARTIALLY ACCEPT:** real problem, but the correction is wrong or
  oversized. Change the plan the smaller way and say what differs.
- **REJECT:** wrong, or not worth the cost. Cite file:line evidence.

Decide on evidence, not on who said it. A correction that adds scope, new
abstractions, or a destructive migration gets the same scrutiny as anything
else. A finding that is really a product decision goes to Greg as an open
question, not silently into the plan.

Revise the plan file, then append:

```
## Codex review log
### Pass 1 (YYYY-MM-DD)
| # | Severity | Finding (short) | Verdict | Reason / what changed |
```

### Step P4: Codex plan pass 2 (final)

Input file `<slug>-plan-pass2-input.md`, standalone, in this order: the
shared rules, the plan review rules, the pass-2 instructions below, Codex's
pass-1 reply verbatim, then the revised plan (which carries the review log)
in a fenced block.

Pass-2 instructions:

> This is the final verification pass. An earlier review produced the
> findings below, and the plan's author gave each a verdict, recorded in the
> plan's "Codex review log".
>
> 1. For each ACCEPT or PARTIALLY ACCEPT, confirm the revised plan resolves
>    it, or explain what is still wrong.
> 2. For each REJECT, accept the verdict or explain, with evidence from the
>    code, why it is still a real problem.
> 3. Report any new issue the revision introduced, in the same format and
>    severity groups.
>
> If everything is resolved and nothing new is meaningful, reply with
> exactly: PLAN_CLEARED

Run with `<name>` = `<slug>-plan-pass2`. Add a "Pass 2" table to the review log.

### Step P5: Gate

No third pass. After pass 2, or a pass-1 `NO_MEANINGFUL_ISSUES`:

- **Survived:** `PLAN_CLEARED`, `NO_MEANINGFUL_ISSUES`, or only items Claude
  has resolved or rejected with evidence. A new pass-2 finding Claude agrees
  with goes into the plan, labeled "revised after final Codex pass, not
  Codex-verified."
- **Stop and surface to Greg, do not implement:** a BLOCKER is still open,
  or Codex maintains a BLOCKER or IMPORTANT finding that Claude still rejects
  after rereading the code. Report both positions with evidence and wait.
- NICE TO HAVE disagreements go in the report but don't block.
- If Greg asked for implementation, implement exactly the surviving plan,
  then run diff mode if the policy calls for it. If he asked only for a
  plan, stop at the report.

Report:

```
Codex plan review: plans/<slug>.md, <1 or 2> passes
Command: <exact codex command>

| # | Codex finding (severity) | Verdict | Reason / what changed |

Final Codex verdict: <PLAN_CLEARED / NO_MEANINGFUL_ISSUES / open items>
Open disagreements / questions for Greg: <none, or both positions>
Next: <implementing / waiting for Greg>
Not done: no code changed, nothing committed, pushed, or deployed.
```

## Diff mode

### Step D1: Define the scope

The scope is this task's changes only, not the whole branch and not whole
files. `Brain/` and other files may carry unrelated uncommitted work.

1. `git fetch origin`. If Greg passed paths or a ref, use them to pick the
   files and base.
2. Pick the base:
   - This task is entirely uncommitted: base = `HEAD`.
   - This task has commits: base = the parent of this task's first commit
     (find it with `git log --oneline $(git merge-base origin/main HEAD)..HEAD`).
     Use `git merge-base origin/main HEAD` only when every commit on the
     branch belongs to this task.
3. List the files this task touched. Leave out files with only unrelated
   changes, and anything sensitive.
4. Build the diff into `.codex-review/<slug>-diff.patch`:
   `git diff <base> -- <files>` for tracked files,
   `git diff --no-index /dev/null <file>` for new untracked files. This file
   is for Codex to read, never to apply.
5. Read every hunk. Delete wholly unrelated hunks from the patch file. If a
   hunk mixes task and non-task lines that can't be cleanly split, keep it
   and list the unrelated lines (file and line range) under an "Out of
   scope" heading in Codex's input, with the note "not part of this change,
   do not review." Separate changes only by editing the patch file. Never
   modify, stage, stash, revert, or rewrite unrelated work in the repo.
6. Tell Greg the file list, changed-line count, and any out-of-scope
   sections in one line. If the diff is empty, say so and stop.

### Step D2: Codex diff pass 1

Diff review rules:

> You are reviewing a code change. The diff below is the scope. Review it
> first. Read surrounding files only to confirm or rule out a specific
> finding (a caller, a type, a documented rule). Anything under "Out of
> scope" is not part of this change: do not report findings against it.
> If an implementation plan is included, check the change against it.
>
> Report only actionable findings in these categories: bug, regression,
> incomplete implementation, incorrect assumption, data loss,
> security/RLS, stale code path (old code still reachable or now wrong),
> plan mismatch, or scope creep (changes beyond what the task needed). Do
> not report style, naming, or formatting preferences unless they cause a
> real maintainability problem, and name that problem. Do not report issues
> in code the diff did not touch unless the diff makes them worse.
>
> Group findings under BLOCKER, IMPORTANT, NICE TO HAVE, omitting empty
> ones. For each finding use exactly this format:
> FINDING <n>
> Category: <one category above>
> Location: <path>:<line>
> Issue: <one or two sentences>
> Failure scenario: <concrete input or state and the wrong result>
> Recommended fix: <one or two sentences>
>
> No numerical scores. If there are no actionable findings, reply with
> exactly: NO_ACTIONABLE_FINDINGS

Input file `.codex-review/<slug>-diff-pass1-input.md`, in this order: the
shared rules, the diff review rules, the plan file (if this change came from
plan mode) in a fenced block, the latest `npm run lint` / `test` / `build`
result in one line each, the file list, any out-of-scope sections, then the
patch in a fenced block.

Run with `<name>` = `<slug>-diff-pass1`. If the reply is
`NO_ACTIONABLE_FINDINGS`, go to Step D5. No second pass.

### Step D3: Judge each finding

For every finding, read the cited code and trace it. ACCEPT (real and
introduced or worsened by this diff: fix it), PARTIALLY ACCEPT (real, fix it
the smaller way), or REJECT (wrong, or pre-existing and not worsened, or a
product call for Greg) with file:line evidence. Any finding against an
out-of-scope section is REJECT, whatever Codex says.

Fixes follow the normal project rules: surgical, no adjacent refactors, no
new abstractions. Fixes never touch unrelated hunks or earlier commits.

### Step D4: Checks, then Codex diff pass 2

1. Run `npm run lint`, `npm run test`, `npm run build`. If a failure comes
   from a fix, fix it. If it's unrelated to this change, say so and continue.
2. Rebuild the patch with the same base and exclusions, adding every file
   and hunk changed by a Step D3 fix.
3. Input file `<slug>-diff-pass2-input.md`, standalone, in this order: the
   shared rules, the diff review rules, the pass-2 instructions below,
   Codex's pass-1 reply verbatim, Claude's verdict on each finding with
   evidence, the plan (if any), the check results, the file list, any
   out-of-scope sections, then the updated patch in a fenced block.

Pass-2 instructions:

> This is a verification pass. An earlier review of this change produced the
> findings below, and the change's author gave a verdict on each, with
> evidence.
>
> 1. For each ACCEPT or PARTIALLY ACCEPT, confirm the updated diff resolves
>    it, or explain what is still wrong.
> 2. For each REJECT, accept the verdict or explain, with evidence from the
>    code, why it is still a real problem in this change.
> 3. Report any new issue the fixes introduced, in the same format.
>
> If everything is resolved and nothing is new, reply with exactly: VERIFIED

Run with `<name>` = `<slug>-diff-pass2`.

### Step D5: Stop and report

No third pass. After pass 2:

- **New finding Claude agrees with:** fix it, rerun the three checks, label
  it "fixed after final Codex pass, not Codex-verified."
- **Meaningful disagreement** (Codex maintains a BLOCKER or IMPORTANT
  finding Claude rejected, or disputes that a fix works, and Claude still
  disagrees after rereading the code): stop, report both positions with
  evidence, and wait for Greg. Do not commit or push.
- NICE TO HAVE disagreements go in the report but don't block.

Report:

```
Codex diff review: <n> files, <n> changed lines, <1 or 2> passes
Command: <exact codex command>

| # | Codex finding (severity) | Verdict | Evidence / what changed |

Checks: lint <result>, test <result, n tests>, build <result>
Final Codex verdict: <VERIFIED / NO_ACTIONABLE_FINDINGS / open items>
Open disagreements: <none, or both positions>
Not done: nothing committed, pushed, or deployed.
```
