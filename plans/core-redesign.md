# Pulse Academic Core Redesign: Implementation Plan (v2)

- Status: Step 2 IMPLEMENTED on branch `feat/core-redesign` (2026-10-03) and passed the Codex diff review (VERIFIED). Greg's signed-in preview test (2026-10-03) passed the core loop, the plan upload, the two-device refusal, the airplane-mode Save and Delete Class. A Done for now button was added to the grid header after the first test (commit `f0b8cca`, Codex diff review `NO_ACTIONABLE_FINDINGS`). The remaining planner actions and the phone trial are still open (see "Preview testing by Greg"). Not merged. Step 3 (dropping legacy tables) is not started.
- Written: 2026-10-02
- Authority: CLAUDE.md "Current redesign direction" first, then Greg's 2026-10-02 decisions recorded in section 2, then `Brain/Pulse Academic Core Redesign Plan.md`.
- Supersedes: v1 of this file (a compatibility-first design), and `IMPLEMENTATION_PLAN.md` (Small Group Pull List).

## 1. Goal

The smallest safe implementation that gives Pulse the new core experience:

> Open a class, tap a student, choose Got it / Check again / Needs help / Not here, Save. Untouched students stay Not checked. See who needs help. Recheck them later as new dated evidence. Today's focus comes from the weekly plan upload.

## 2. What changed since v1

**Pulse Academic has no real users except Greg.** He is fine losing the old test data. So this plan:

- **drops** all legacy compatibility work:
  - mixed old/new History
  - legacy multi-skill interpretation
  - old reteach counters in the UI
  - legacy Needs Help feeding new logic
  - stale-old-build handling
  - legacy history pagination and identity handling
- **builds** the new path on new tables, and leaves old tables and data untouched until the new system is proven (Step 3)
- **removes** old code in the same branch that adds the new path. Production keeps running the old code until Greg proves the branch preview and merges it. Git history keeps everything restorable.

Greg's decisions, in addition to CLAUDE.md:

- **Labels:** Got it, Check again, Needs help, Not here, Not checked. Stored values stay `got-it`, `almost`, `needs-help`, `absent`, and null.
- **Exit tickets and AI mini lessons** are not in the daily UI. Their source is removed (section 7.6), because keeping it would pin the old plan fields.
- **Demo:** a realistic 25-student synthetic class.
- **Planner purpose:** upload once a week so Pulse knows each day's focus. It keeps upload/extraction, one focus plus a lesson label per day, manual edit, and Skip Day with push-back. Everything else goes.

## 3. Decisions and where they land

| Decision | Where |
| --- | --- |
| Class grid + student quick sheet | 7.4 workspace, 7.3 sheet |
| Untouched students stay Not checked | No default result anywhere. Notes never write a result (7.2, 7.3) |
| Optional explicit "Mark remaining as Got it" | 7.4 confirm step, 7.2 writes that only fill unmarked students |
| Weekly upload stays, one daily focus, "Lesson 17" fallback, manual override | 7.1 planner. 7.4 per-check focus edit |
| One overall result per student per check | `check_results` unique (check_id, student_id) (6) |
| Notes secondary | Note-only save leaves `result` null (7.2) |
| Rechecks are new dated evidence, originals preserved | New `checks` row with `root_check_id`. Ended checks are read-only at the database (6) |
| Multi-skill fan-out leaves the core | New tables have no skill concept. Old writer deleted (7.5) |
| Planner reduced to supplying the focus | 7.1 |

## 4. Current code facts this plan relies on

- `buildCheckinRows` (`src/App.tsx:685`) and its callers `tap`, `saveNote` and `confirmAllGotIt` (`src/App.tsx:1006`, `:700`, `:1038`) are the only daily writers. All of them are deleted. `saveNote` writes Got it for unmarked students (`src/App.tsx:709`), which is one reason the old path can't simply be relabeled.
- The legacy schema doesn't fit the new model:
  - **No unique identity per check.** `lessons` is looked up by class + date + title (`src/App.tsx:951-957`).
  - **Wrong key shape.** `checkins` is keyed on `lesson_id,student_id,skill` and carries `retaught_count`.
  - **No room for the new concepts.** It has no participant list, end marker or recheck link.

  Reshaping those tables means changing a populated unique key, which needs a data cleanup first. New tables need only CREATE.
- `week_plans` is one row per user per week, upserted on `user_id,week_start` (`src/App.tsx:1249`). It stays, with a simpler JSON payload.
- Class subjects come from the fixed list in `src/SetupScreen.tsx:4` and the matching `SUBJECTS` in `src/App.tsx:280`. That is why the AI can assign each plan lesson straight to one of the teacher's subjects, and why the subject-mapping step can go (7.1).
- Class delete is a single `delete from classes` that relies on FK cascades (`src/App.tsx:401-404`, verified live per AGENT_HANDOFF.md:15). New tables must cascade from `classes`, or Delete Class breaks.
- `tsconfig.app.json` has `noUnusedLocals`/`noUnusedParameters`, so removed code has to be removed fully.
- `formatStudentName` gives both colliding students the same `(2)` suffix (`src/App.tsx:99`).

## 5. Sequence

| Step | What | Database | Gate |
| --- | --- | --- | --- |
| Phase 0 | Read-only metadata inspection | None | Greg approves after seeing this reviewed plan |
| Step 1 | Write and apply the additive migration, then verify RLS | CREATE only | Greg approves applying it |
| Step 2 | Branch `feat/core-redesign`: new planner, new workspace, old code removed. Preview, then Codex diff review | None | Greg proves the preview and merges |
| Step 3 | Drop legacy tables | DROP, later | Greg has used the new system and approves explicitly |

## 6. Data model

Two new tables. The reason is fit, not compatibility. One check needs a unique id, a participant list, an end marker and an optional root link. One result per student per check needs a nullable result for note-only saves. The legacy tables have none of these.

```sql
create table public.checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  focus text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  root_check_id uuid,
  participant_ids uuid[] not null,
  unique (id, class_id),
  foreign key (root_check_id, class_id) references public.checks(id, class_id) on delete cascade
);
create index checks_class_started_idx on public.checks (class_id, started_at desc);

create table public.check_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  check_id uuid not null references public.checks(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  result text check (result in ('got-it', 'almost', 'needs-help', 'absent')),
  note text,
  created_at timestamptz not null default now(),
  unique (check_id, student_id)
);

-- Phase 0: this schema's default privileges auto-grant anon and authenticated ALL
-- (including TRUNCATE, which bypasses RLS) on every new table. Strip them first.
revoke all on public.checks, public.check_results from anon, authenticated;
grant select, insert, update, delete on public.checks to authenticated;
grant select, insert, update, delete on public.checks to service_role;
grant select, insert, update, delete on public.check_results to authenticated;
grant select, insert, update, delete on public.check_results to service_role;
alter table public.checks enable row level security;
alter table public.check_results enable row level security;

create policy checks_select on public.checks for select to authenticated
  using (user_id = (select auth.uid()));
create policy checks_insert on public.checks for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.classes c where c.id = class_id and c.user_id = (select auth.uid())));
-- Only open checks change (focus edit, Done for now). Ended checks are read-only.
create policy checks_update_open on public.checks for update to authenticated
  using (user_id = (select auth.uid()) and ended_at is null)
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.classes c where c.id = class_id and c.user_id = (select auth.uid())));

create policy check_results_select on public.check_results for select to authenticated
  using (user_id = (select auth.uid()));
create policy check_results_insert_open on public.check_results for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.checks k where k.id = check_id and k.user_id = (select auth.uid()) and k.ended_at is null)
    and exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid())));
create policy check_results_update_open on public.check_results for update to authenticated
  using (user_id = (select auth.uid())
    and exists (select 1 from public.checks k where k.id = check_id and k.ended_at is null))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.checks k where k.id = check_id and k.user_id = (select auth.uid()) and k.ended_at is null)
    and exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid())));
```

Notes:

**What each piece is for**
- `participant_ids` is the frozen list of who the check covers. Without it, a 3-student recheck can't tell Not checked from not included. It is not FK-enforced. The app writes it from the roster.
- The composite FK keeps a recheck's root in the same class. The class is owner-checked, so the root has the same owner too.
- `result` null means Not checked, including note-only rows. Chronology across checks is `started_at`, then `id`. No other timestamps are needed.

**Write rules enforced by policies**
- There are no DELETE policies, so the app can't delete evidence. Class delete still cascades: FK actions aren't subject to RLS. Clear result writes `result: null`.
- The ended-check guard is what makes "rechecks preserve the original" hold even across Greg's phone and laptop. An upsert into an ended check raises an RLS error instead of silently writing.
- `ponytail:` a Save committing in the same instant as an End on another device can still land. That's accepted. Upgrade path: a row-locking RPC.

**Access**
- No anon grant. Demo mode never calls Supabase for these tables.

Confirmed against Phase 0 (appendix): column types, the `auth.users` reference pattern and PG 17. The policy style deliberately differs from the existing tables, see the appendix. The grants block now revokes the default privileges first.

## 7. Step 2: the branch

One branch, `feat/core-redesign`, as ordered commits: 7.1 to 7.4 build the new path, 7.5 to 7.6 remove the old one. The migration file from Step 1 is committed here too. Greg merges after proving the preview.

### 7.1 Planner: `src/lib/ai.ts` and `src/components/PlanScreen.tsx` (rewrite)

**Extraction.** `parseLessonPlan(text, weekStart, classSubjects)`:
- The strict JSON schema is `days[{ date, entries[{ subject, title, focus }] }]`, where `subject` is an **enum of the teacher's distinct class subjects**.
- The prompt asks the model to:
  - assign each lesson in the plan to one of those subjects, and skip lessons that match none
  - set `title` to the lesson's own name or number as written (e.g. "Lesson 17"), or a short name if none
  - set `focus` to the single main learning focus in under 80 characters, or an empty string if the plan doesn't make one clear

  There are no confidence scores and no skills.
- The parsed result is `WeekSchedule = Record<date, Record<subject, { title: string; focus: string }>>`.
- Old `week_plans` rows read fine, since they have `title`, and get no special handling.

**Why subject mapping and tracked-subject confirmation go.** Both existed because the AI invented free-text subject names ("Mathematics", "Reading") that then had to be matched to class subjects, and the teacher had to filter which ones mattered. Constraining `subject` to the teacher's own subjects removes both problems at the source. Lessons for subjects the teacher doesn't track are simply not returned.
- `subject_mappings` is no longer read or written. It is dropped in Step 3.
- `week_plans.tracked_subjects` is no longer written or read. Phase 0 shows it is nullable, so the planner simply omits it, and `class_id` (also nullable) is omitted too.

**PlanScreen owns its state and handlers.** App.tsx today holds about 30 planner state variables and handlers (`src/App.tsx:209-238`, `:1138-1433`). The new PlanScreen takes `userId`, `classSubjects`, `weekStart`, `nextWeekStart`, `today` and `onCurrentWeekSaved(plan)`. Its flow:

1. A This week / Next week toggle. Next week is needed for Sunday prep, because `getWeekStart` maps Sunday to the past Monday.
2. Upload a file (existing PDF/DOCX/text extraction) or paste text.
3. Extract, then save immediately: upsert `week_plans` on `user_id,week_start`. There is no confirm step, because editing fixes mistakes.
4. The week view shows, per day and subject, the focus. With no focus, it shows the title with "No clear focus found, using lesson name".
5. **Every day lists all of the teacher's class subjects.**
   - A subject with an entry shows **Edit** (two inputs: focus and lesson label) and **Remove**.
   - A subject without one shows **Add focus**.
   - Fixing a lesson the AI put under the wrong subject means Add on the right subject and Remove on the wrong one. No move operation and no collision handling are needed, and the same path covers subjects the AI missed. *(Revised after final Codex pass, not Codex-verified.)*
6. **Skip day** offers "Just remove this day" or "Push remaining days back".
   - It reuses today's `skipDay` logic without the undo snapshot.
   - **Push-back stays inside the selected week.** An entry pushed past Friday is dropped, not written into this week's row under a next-week date, which no loader reads. The confirm text says so: "Friday's focus will drop off this week's plan."
   - It never reads or writes another week's row.
7. **Replace plan** means uploading again.
8. Errors show inline. A failed save keeps the extracted schedule on screen.

**Demo:** Plan stays unreachable in demo mode, as today. The nav guards are at `src/App.tsx:1629` and `:1779`, and the workspace links to Plan only when `!isDemo`. PlanScreen never mounts in demo, so it needs no `isDemo` prop and never calls AI or Supabase with the demo identity. The demo's daily focus comes from a fixture week plan passed straight to the workspace (7.7).

**Removed from the planner:** subject mapping, tracked-subject confirmation, swap day, swap subject, skip subject, copy to next day, undo, the objective/activities/assessment fields, and skill chips.

### 7.2 `src/lib/checks.ts` (new) + `src/lib/checks.test.ts` (new) + `src/lib/names.ts` (new)

**Types.** `Result`, `Check`, `CheckResult { id, check_id, student_id, result: Result | null, note: string | null }`.

**Pure functions, unit-tested:**
- `defaultFocus(plan, classSubject, today)`: the entry for `plan.schedule[today][classSubject]`, giving `focus`, else `title`, else `null`.
- `checkLabel(check)`: the focus, or "Check · Oct 2, 10:15 AM" from `started_at`.
- `summarize(check, results)`: each participant's label (Got it / Check again / Needs help / Not here / Not checked), with note-only counting as Not checked, plus counts for "18 checked · 2 not here · 5 not checked".
- `remaining(check, results)`: participants with no row, and participants with a null-result row.
- `supportFor(checks, results)`: groups by root (`root_check_id ?? id`) and orders by `started_at`, then `id`. Per student, the latest non-null, non-absent result is the latest understanding. A root is returned with its students whose latest understanding is needs-help or almost. If their latest attempt was absent, they get "Not here on <date>" context.
- `formatStudentName` moves to `src/lib/names.ts`. Colliding first name + last initial now shows full names.

**Tests (vitest, no Supabase):**
- **Support:**
  - Monday needs-help, then Tuesday recheck got-it: resolved
  - Tuesday recheck absent: unresolved, with context
  - Tuesday recheck note-only: unresolved
  - unrelated check with the same focus text: separate
- **Counting:**
  - note-only counts as Not checked
  - `remaining` splits no-row from note-only, and excludes absent and set results
- **Focus and names:**
  - `defaultFocus` fallbacks
  - duplicate-name formatting

**Supabase calls.** All are awaited and return `{ data, error }`:
- **Loading a class**
  - `fetchAllById(makeQuery)` is a keyset loop: `.order('id').gt('id', last).limit(500)` until an empty page. It's cap-independent and can't skip rows. It's needed because one class passes 1000 result rows in about two months.
  - `loadClass(classId)` returns the class's checks and its results (via `checks!inner(class_id)`, with `students(name)` joined), each through `fetchAllById`. The workspace derives the open check, recent checks, support list and per-student history from this one load.
- **Checks**
  - `createCheck({ classId, focus, participantIds, rootCheckId? })` does insert, then `.select().single()`.
  - `updateFocus(checkId, focus)` and `endCheck(checkId)` both reload the class on a 0-row result.
- **Results**
  - `saveResult(checkId, studentId, fields)` upserts on `check_id,student_id`, sending only the changed fields. PostgREST merge updates only the columns sent, so a note save can't touch `result`. It is idempotent, so a retry can't duplicate.
  - `markRemaining(checkId, noRowIds, noteOnlyIds)` makes two writes that can only fill unmarked students:
    1. upsert with `ignoreDuplicates: true` (`ON CONFLICT DO NOTHING`)
    2. update `result = 'got-it'` where `result is null`

    Then it reloads the class. If anything failed: "Couldn't mark everyone. Showing what saved."

### 7.3 `src/components/StudentSheet.tsx` (new)

Behavior:
- Full name and focus at the top.
- Radio choices for Got it, Check again and Needs help, with Not here secondary.
- Add note is collapsed, with the existing `MicButton`.
- **No default selection.** Save stays disabled until something changed. Open and close writes nothing.
- Save uses the `checkId`/`studentId` captured on open, blocks double submit, and shows a spinner on Save only.
- On success: close, update the tile, show "Saved for <name>", and keep the scroll position.
- On failure: keep the draft and show "Not saved. Try again."
- Clear result saves `result: null` and keeps the note.
- Dismissing with unsaved changes asks Discard / Keep editing.

Accessibility and styling:
- Labeled `role="dialog"`, Escape follows the dismiss rule, and focus returns to the tile.
- Visual primitives come from the current note modal.

### 7.4 `src/components/Workspace.tsx` (new, replaces `TrackerScreen.tsx`)

It receives `userId`, `isDemo`, the selected class, its students and the current week plan. In demo mode it keeps checks and results in local state and never calls Supabase.

**Idle**
- **Continue** the newest open check, if there is one. Other open checks show in Recent checks tagged "Open".
- **Check understanding** creates a check. Its focus comes from `defaultFocus`, and its participants are the current roster. If a check is already open: Continue it, or End it and start new.
- If today's plan has entries but none for this class's subject, quick-pick chips offer them as the focus.
- **Who needs you** lists `supportFor` groups: focus, date, Needs help / Check again names, and a **Recheck** button.
- **Recent checks**: the last 10, plus Show all. Tapping an **Open** check resumes recording it, by id. Tapping an ended check shows its results, read-only.
- An empty class links to Roster.

**Recording**
- Header: the focus (tap to edit, which saves `updateFocus`), and the progress strip.
- **Grid order:** stable alphabetical by display name, then id. No risk sorting.
- **Tiles:** one full-tile button per participant still in the roster. The name wraps to two lines, with a status text and icon and a quiet note dot.
- **Columns:** four on ordinary phones, three on narrow ones.
- Unmarked tiles are neutral and read Not checked.
- **View results** is available any time. The secondary **Mark N remaining as Got it** has a confirm step.

**Results**
- Sections: Needs help, Check again, Got it (collapsed), Not here, Not checked.
- Participants no longer in the roster show by name when they have a result row (joined `students(name)`). Those without one show as "+N no longer in this class".
- Empty states: "All checked students got it" (plus any Not here / Not checked), "No understanding recorded yet", and a distinct error state when loading fails.
- Actions: Back to grid, **Done for now** (`endCheck`), **Recheck**.
- Tapping a name opens a read-only **student history** sheet: that student's results across this class's checks, dated, with notes. It comes from the `loadClass` data, with no extra query.

**Recheck**
- A sheet lists the class students with the root's support set pre-checked. Start creates a check with `rootCheckId` = `root_check_id ?? id`, the inherited focus, and the chosen participants. Its label reads "Recheck · 3 students".

**Last class** is remembered in `localStorage`, wrapped in try/catch.

### 7.5 `src/App.tsx` and types: remove the old daily system

**Remove:**
- **Writers and handlers:**
  - `tap`, `confirmAllGotIt`, `saveNote`, `buildCheckinRows`, `getActiveLessonSkills`
  - `startLessonByTitle`, `startLesson`, `switchSubject`
  - `dismissCheckin`, `markRetaught`, `clearLesson`
- **Note and hold-to-note UI:** the hold refs and the note modal.
- **Loaders and derivations:**
  - the history loader and `historyData`
  - `repeatStrugglers`, `atRiskStudentIds`/`sortedCurrentStudents`, `todayFlaggedCount`
  - `reportData`, `buildReportText`, `buildGroupsText`
- **Planner state and handlers** that move into PlanScreen or are deleted.
- **Other state:** `activeSubject`, the subject tab bar, `subject_mappings` loading, `showSkills`, and the exit-ticket state.

**Keep:** auth props, class and student loading, roster/class CRUD, Delete Class, `nameFormat`, and the current-week `week_plans` load (one load, replacing the two duplicate loaders at `src/App.tsx:784-822` and `:835-859`).

**Navigation:** Tracker, Plan, Roster, Sign out. History and Reports are gone. Their jobs move into the workspace as Recent checks, results and student history.

**Types:** `src/types.ts` drops the props interfaces for deleted screens and the `Report*`, `HistoryRow`, `HistoryTab` and `ReportRange` types. `src/lib/supabase.ts` drops the unused `Skill`/`SkillMastery` types.

**Roster:** `src/components/RosterScreen.tsx` drops the Skills toggle.
- **Student names become plain text.** Today each name navigates to History (`src/components/RosterScreen.tsx:183`), which no longer exists. The `setScreen`, `setSelectedStudentId` and `setHistoryClassId` props go with it. Student history is reachable from the workspace.
- The Delete Class copy changes from "Lessons for this class / Check-ins, notes, and status history" to "Checks, results, and notes for this class".

### 7.6 Delete files

| Path | Why |
| --- | --- |
| `src/components/TrackerScreen.tsx` | Replaced by `Workspace.tsx` |
| `src/components/HistoryScreen.tsx` | Replaced by Recent checks, results and student history in the workspace |
| `src/components/ReportsScreen.tsx` | Replaced by results and Who needs you |
| `src/components/StudentProfileSheet.tsx` | Replaced by the student history sheet |
| `src/lib/groups.ts` | Old pull-list grouping, no longer used |
| `IMPLEMENTATION_PLAN.md` | Describes the removed pull-list features and would mislead future agents |
| `suggestExitTickets`, `suggestMiniLesson`, `ExitTicket`, `MiniLesson` in `src/lib/ai.ts` | They depend on the dropped `objective`/`activities`/`assessment` plan fields. Keeping them would pin the old plan shape. The removing commit is noted in the PR so a future Pro feature can restore them |

**Kept:** `parseStudentNames`, the `openai-proxy` edge function, `MicButton`, `deleteClass.ts` and its test.

Before deleting, grep each symbol to confirm no remaining callers.

### 7.7 Demo: `src/lib/demo.ts`

- Period 1 becomes 25 synthetic students, with duplicate first names, a shared last initial and long names. Period 2 stays small, for class switching.
- Fixtures in the new format:
  - an ended check with mixed results
  - a recheck resolving some students
  - an open check
  - a demo week plan with a focus per weekday
- The old demo lessons and check-ins are removed.

### What Step 2 must not change

- Auth, `Root.tsx`, the setup flow and password reset
- Roster and class CRUD and Delete Class behavior (copy only)
- The `openai-proxy` edge function
- Any row in `lessons`, `checkins`, `skills`, `skill_mastery` or `subject_mappings`: nothing writes them any more, and nothing deletes them until Step 3

## 8. Phase 0: read-only inspection, revised

Metadata only, no row content and no counts. Run only after Greg sees this reviewed plan and says go.

1. `classes`, `students`: every column's type, nullability and default, including the `id` and `user_id` types and any other required columns the Step 1 fixtures must fill (`information_schema.columns`). Also whether `user_id` references `auth.users` and with which delete rule (`pg_constraint`). *(Expanded after final Codex pass, not Codex-verified.)*
2. RLS policies on `classes` and `students` (`pg_policies`): roles and the `auth.uid()` form, to mirror.
3. Grants on `classes` (`information_schema.role_table_grants`), to mirror the pattern.
4. `week_plans`: columns, nullability and defaults (especially `tracked_subjects` and `class_id`), plus the `user_id,week_start` unique constraint. The new planner writes a different payload into this table.
5. Non-internal triggers on `classes`, `students` and `week_plans` (`pg_trigger`) that could interact with the new FKs or writes.
6. Postgres version, confirming built-in `gen_random_uuid()`.

Answers go in an appendix here. Any mismatch with section 6 gets fixed before Step 1.

Removed from v1: legacy unique-constraint and duplicate checks, legacy row counts, legacy FK forensics, and the max-rows check (keyset paging doesn't depend on it).

## 9. Step 1: apply and verify the migration

- **File:** `supabase/migrations/<timestamp>_core_checks.sql` (section 6, as finalized after Phase 0).
- **Apply:** applied with Greg's approval through the Supabase connector. It's additive, and nothing reads the tables until Step 2 merges.

**Verify, in three parts. None of them writes to an existing table.**

**A. Metadata (read-only queries).**
- `list_tables` shows both tables with RLS on, and the advisors show no new security warnings.
- Effective privileges, using `has_table_privilege` (never by running TRUNCATE):
  - `authenticated` has SELECT, INSERT, UPDATE and DELETE, and **no TRUNCATE, REFERENCES or TRIGGER**, on both tables
  - `anon` has **no** privileges on either table
  - `service_role` has SELECT, INSERT, UPDATE and DELETE
- `pg_get_constraintdef` shows the composite root FK.

**B. Behavior, in one `DO` block.** It is submitted as a single statement, and it **always ends with `RAISE EXCEPTION`**, so Postgres rolls back every change it made. The outcome is read from the exception message: `VERIFY_OK`, `VERIFY_FAIL: <step>` or `VERIFY_SKIP: <reason>`.

An unexpected error also aborts and rolls back the whole block. Every expected refusal sits in its own `BEGIN ... EXCEPTION WHEN <sqlstate> THEN ... END`, which checks the specific SQLSTATE; any other error becomes `VERIFY_FAIL`. That is how one submission runs every assertion: no client-side savepoint recovery is needed.

1. **Fixtures by reference.** As `postgres`, pick an owner `user_id` that owns at least one class and one student. Take class A, optionally class B, and student S. These are ids only, read from `classes`/`students`, never selected out of the block, and no existing rows are inserted, updated or deleted.
   - With no qualifying owner, raise `VERIFY_SKIP: fixtures`, and Claude asks Greg before doing anything else.
   - With no class B, step 6's cross-class test falls back to the part A FK definition check.
2. **Act as the owner:**
   - `set_config('role', 'authenticated', true)`
   - `request.jwt.claims` = `{"sub": owner}`
   - `request.jwt.claim.sub` = owner
3. **Expected successes, using the exact SQL forms the C2 calls generate:**
   - **Create:** insert check A1 (participants = `{S}`) `RETURNING id`, which proves RETURNING passes the SELECT policy.
   - **Merge upserts:**
     - upsert `(A1, S)` with `result 'needs-help', note 'n1'` via `ON CONFLICT (check_id, student_id) DO UPDATE SET <payload columns> = EXCLUDED.<...>`
     - a note-only merge (payload without `result`): assert `result` is still `needs-help`, `note` is `n2`, and there's 1 row for `(A1, S)`
   - **Duplicate-ignore** (`ON CONFLICT DO NOTHING`) with `result 'got-it'`: assert `result` is still `needs-help`.
   - **Conditional update:**
     - `update ... set result='got-it' where check_id=A1 and student_id=S and result is null`: 0 rows, and the result is unchanged
     - clear the result (merge `result = null`), rerun the conditional update: 1 row, now `got-it`
   - **End:** `update checks set ended_at = now() where id = A1`: 1 row.
4. **Expected refusals on ended checks:**
   - merge upsert into `(A1, S)`: SQLSTATE `42501`, since the UPDATE policy USING fails on the ended check
   - create and end check A2, then insert a result for S (the insert path): `42501`
   - update A1's focus: 0 rows
   - delete from `check_results` and from `checks` for A1: 0 rows each (no DELETE policy)
5. **Another identity.** Set the `sub` to a random uuid R:
   - selects on A1 and its results return 0 rows
   - insert a check with `user_id = owner`, class A: `42501` (`user_id = auth.uid()` fails)
   - insert a check with `user_id = R`, class A: `42501` (the class-ownership clause fails). RLS WITH CHECK runs before the FK trigger, so a `23503` here means `VERIFY_FAIL: ordering`, which would need a different test, and gets reported.
6. **Cross-class root.** Back as the owner, if class B exists: insert a check in class B with `root_check_id = A1`, expecting `23503` (FK).
7. **Anon.** `set_config('role', 'anon', true)`, then select from `checks`: `42501` (permission denied).
8. **Finish.** `RAISE EXCEPTION 'VERIFY_OK'`. Everything above rolls back.

**C. Residue (read-only).** `select count(*)` on `checks` and `check_results` must both be 0. These tables are new, so any row is test residue.

**Not covered here:** whether supabase-js generates exactly those SQL forms. That is client behavior, verified in Step 2 (section 11).

## 10. Step 3: legacy cleanup, later and separate

Only after Greg has used the new system and explicitly approves:
- A migration drops `checkins`, `lessons`, `skill_mastery`, `skills` and `subject_mappings`.
- Before writing it:
  - grep the code for references
  - inspect live database dependencies (views, functions, policies, triggers and FKs that reference those tables, via `pg_depend`/`pg_constraint`), since a source grep alone doesn't see them
- Update the Delete Class comments at `src/App.tsx:401` and `src/lib/deleteClass.ts:3`.
- `week_plans` stays.

Not part of Step 2.

## 11. Verification for Step 2

- **Checks:** `npm run lint`, `npm run test`, `npm run build`.
- **Demo, `npm run dev`, at phone width and again at large text:**
  - **Grid and sheet:**
    - 25-student grid fit
    - open and close with no write
    - select and Save, then a correction
    - note-only (tile stays Not checked)
    - Not here
    - Mark remaining
  - **Check lifecycle:**
    - results mid-check, Done for now, Continue
    - two open checks: resume the older one from Recent checks
    - recheck resolving one student and leaving one absent
  - **Demo isolation:** no Plan entry, and no network calls to AI or Supabase tables
  - **Other:**
    - student history
    - class switch
    - duplicate names
- **Preview, Greg's account:**
  - **Planner:** upload one clear and one vague synthetic plan. Each day shows a focus or the "Lesson N" fallback. Edit, then move a lesson to the right subject with Add + Remove (after a reload, the intended class's new check defaults to it). Skip day and push back (Friday's entry drops, next week's row is untouched), then a Next-week upload.
  - **Workspace:** the full demo walkthrough, with a reload after each step.
  - **Failure cases:**
    - an airplane-mode Save keeps the draft
    - phone and laptop: end on one, then save on the other: refused
    - phone records Needs help while laptop runs Mark remaining: Needs help survives
  - **Other:**
    - Delete Class on a throwaway class removes its checks
    - counts-only queries show one `check_results` row per student per check
    - **client SQL forms** (the part section 9 can't prove):
      - a note-only save leaves `result` unchanged
      - Mark remaining leaves an existing Needs help untouched
      - `createCheck` returns its row
      - all of it confirmed by reloading in the app
- **Phone trial:** a real class-sized pass, standing and one-handed. If Save wait feels slow, fix the save path, not the interaction.
- **Review:** `/codex-review` diff review before Greg merges.

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Three taps plus a network wait per student | Phone trial before merge. Mark remaining covers the all-good majority |
| AI assigns a lesson to the wrong subject | Visible per day in the planner. Fixed with Add on the right subject and Remove on the wrong one (7.1). Each check's focus is also editable |
| Two classes share a subject but teach different lessons (e.g. two grade levels of Math) | They get the same default focus. The per-check focus edit covers it. Known limit, revisit only if it bites |
| Losing History/Reports breaks a habit | Their useful jobs live in the workspace. Copy/print are dropped (add back later if wanted) |
| Support list never auto-clears | Per Core Redesign Plan. An archive action only if needed |

## 13. Out of scope

- Legacy data display or conversion
- Copy/print
- Editing ended checks
- Archive
- Offline queue
- Analytics
- Pro features
- Settings or feature flags
- PKCE
- `groq-proxy` cleanup
- Marketing site

## Appendix: Phase 0 results (2026-10-02)

Project `zhkgdbjhcignpcspllso` ("Pulse-academic"). Read-only catalog queries only. No row content, no counts.

| # | Check | Result | Effect on the plan |
| --- | --- | --- | --- |
| 1 | `classes`, `students` columns | `classes`: `id uuid` (default `gen_random_uuid()`), `user_id uuid not null` (no default), `name text not null`, `subject text not null`, `display_order int not null default 0`, `created_at not null default now()`. `students`: `id uuid` (default), `user_id uuid not null` (no default), `name text not null`, `created_at not null default now()`. Both `user_id` columns are FKs to `auth.users(id) ON DELETE CASCADE` | The draft's uuid FKs and `auth.users ... on delete cascade` match. The Step 1 fixtures must set `classes(user_id, name, subject)` and `students(user_id, name)`. The new tables keep `default auth.uid()` on `user_id`. Existing tables have no default and the app sends `user_id` anyway, so this is harmless |
| 2 | RLS on `classes`, `students` | One permissive `owner` policy each: `cmd ALL`, roles `{public}`, `user_id = auth.uid()` in USING and WITH CHECK | The new policies deliberately differ in three ways. Per-command policies are needed for the ended-check guard and to allow no deletes. `to authenticated` is stricter than `public`. `(select auth.uid())` is the form the Supabase performance advisor recommends; the existing tables are already flagged for per-row `auth.uid()` (AGENT_HANDOFF.md:235). The policy subqueries on `classes`/`students` run under those tables' owner policies, which is the intended scoping |
| 3 | Grants on `classes` | `anon`, `authenticated` and `service_role` each hold every privilege, including TRUNCATE, REFERENCES and TRIGGER. Schema default privileges (`pg_default_acl`, for both `postgres` and `supabase_admin` in `public`) grant the same to all three on **every new table** | **Migration changed:** it now revokes all from `anon` and `authenticated` before granting `select, insert, update, delete` to `authenticated` and `service_role`. Without the revoke, `anon` would hold full grants (only RLS keeping it out), and `authenticated` would hold TRUNCATE, which bypasses RLS. Existing tables have the same broad grants. That's pre-existing and out of scope |
| 4 | `week_plans` | `plan_json jsonb not null`. `class_id uuid` and `tracked_subjects` array are nullable with no default. `UNIQUE (user_id, week_start)`. `user_id` FK to `auth.users ON DELETE CASCADE` | The planner's upsert on `user_id,week_start` is backed by a real constraint. The planner stops writing `tracked_subjects` and `class_id`: both are nullable, and nothing will read them (7.1) |
| 5 | Triggers on `classes`, `students`, `week_plans` | None (non-internal) | Nothing interacts with the new FKs or the planner writes |
| 6 | Postgres | 17.6 | `gen_random_uuid()` is built in |
| 7 | Referenced keys and policy-subquery access (follow-up after the focused migration review) | `classes_pkey` and `students_pkey` are `PRIMARY KEY (id)`, from the item 1 constraint query. `authenticated` and `service_role` hold SELECT, INSERT, UPDATE and DELETE on both `classes` and `students` (`has_table_privilege`) | The new FKs reference valid unique keys. The policy subqueries on `classes`/`students` can run as `authenticated` |
| 8 | Connection role (same follow-up) | The connector runs as `postgres`, which is a member of `authenticated` and `anon` | The section 9 `DO` block can switch roles with `set_config('role', ..., true)` |

No contradiction with section 6 beyond the grants change in item 3. The finalized migration draft in section 6 is what Step 1 applies, once Greg approves.


## Appendix: Step 1 results (2026-10-03)

Migration applied as `20261003032810 core_checks`. The SQL is saved at `supabase/migrations/20261003032810_core_checks.sql`, identical to section 6.

| Part | Check | Result |
| --- | --- | --- |
| Pre-check | `ensure_rls` event trigger (`public.rls_auto_enable()`), found before applying | It only runs `enable row level security` on new `public` tables, the same thing the migration does. No conflict |
| A | RLS and policies | RLS on for both tables, 3 policies each |
| A | Effective privileges | `anon`: none. `authenticated`: SELECT, INSERT, UPDATE, DELETE only, with no TRUNCATE, REFERENCES or TRIGGER. `service_role`: full, which is more than the planned CRUD because its default privileges weren't revoked. Accepted: it's the admin role and bypasses RLS anyway |
| A | Constraints | Match section 6, including `checks_root_check_id_class_id_fkey` (`FOREIGN KEY (root_check_id, class_id) REFERENCES checks(id, class_id) ON DELETE CASCADE`) |
| A | Security advisors | The same 3 warnings before and after (two for `rls_auto_enable()`, one for leaked-password protection). Nothing new |
| B | Behavior `DO` block | `VERIFY_OK`. The connector's permission prompt failed twice ("declined"/"interrupted"), so Greg ran the saved script (`.codex-review/step1-behavior-verify.sql`) in the Supabase SQL Editor. Every success and refusal step passed |
| B | Cross-class root test | Skipped by design: the fixture owner has one class. Covered by the FK definition in part A. Runtime coverage waits until an account has two classes |
| C | Residue | `checks` 0 rows, `check_results` 0 rows, checked after the run |


## Appendix: Step 2 results (2026-10-03)

**Deviations from sections 7.1 to 7.7, all small:**

| What | Why |
| --- | --- |
| The Supabase calls live in `src/lib/checksDb.ts`, not in `src/lib/checks.ts` | The Supabase client needs an env key at import time. Keeping it out of `checks.ts` lets the unit tests run without one |
| `ResultsView`, `RecheckSheet` and `StudentHistorySheet` live in `src/components/CheckViews.tsx` | `Workspace.tsx` would otherwise pass the 500-line guideline in CLAUDE.md |
| `weekDates` and `skipPlanDay` are pure helpers in `checks.ts`, with tests | The in-week push-back rule is logic worth a test |
| The recording header has a back control to the class home | Without it, the only way out of the grid was ending the check, which defeats Continue |
| The demo's bottom bar has "Exit demo" | Plan and Roster are hidden in demo, so the bar had one item, and mobile had no way out of the demo |
| The demo plan always covers today, weekends included | Otherwise the demo shows "No focus set" two days a week |
| Adding a class selects it when no class is selected | Needed for the new "No classes yet" state to recover |
| The print CSS block in `src/index.css` is removed | It only served the deleted Reports screen |
| `CLAUDE.md` overview and "Current redesign direction" updated | They still said History and Reports were core screens and that old data must stay readable |
| One app commit, not the ordered 7.1 to 7.6 commits | The new and old paths meet in `App.tsx`, so intermediate commits would not build |

**Not changed, and worth knowing:**
- `npm run lint` still reports 4 errors, all in `src/components/MicButton.tsx`, which this work doesn't touch. `main` had 5 errors and 3 warnings. New and changed files are clean.
- The Roster "Paste student names" modal still has an em dash in its copy, from before this work.
- `src/Landing.tsx` still advertises exit tickets. It isn't imported anywhere, so users never see it.

**Verification run by Claude:**

| Check | Result |
| --- | --- |
| `npm run test` | 40 passed (17 existing, 23 new) |
| `npm run build` | Passes |
| Demo walkthrough in a real browser at phone size | 59 of 59 checks: grid, sheet, note-only, Not here, corrections, discard, Mark remaining, results, student history, Done for now, recheck, class switch, 320px width, large text, keyboard trap, and no calls to Supabase tables or the AI |
| Signed-in walkthrough against a mocked Supabase | 58 of 58 checks, including the exact requests the app sends: merge upserts that carry only the changed field, the duplicate-ignoring insert, the "only if unmarked" update, refusal on an ended check, recheck linking, keyset paging, and the planner (AI subject list, save payload, Add/Remove, in-week push-back, failed-save retry) |

**Not verified by Claude:** the real Supabase write path from the app. That needs a signed-in account, so Greg does it on the preview (section 11). His results are in "Preview testing by Greg" below.

**Three bugs the browser runs caught and fixed before review:**
- The bottom tab bar covered the sheet's Save button. Sheets now sit above it.
- Escape did nothing after a failed save, because focus had left the sheet. Escape is now handled at the page level.
- 25 tiles on a 390x844 phone need a short scroll, because the header and class tabs take the top of the screen. Left as is.

### Codex diff review (2026-10-03)

Pass 1 found no blockers and four IMPORTANT issues. Pass 2 replied `VERIFIED`.

| # | Finding (short) | Verdict | What changed |
| --- | --- | --- | --- |
| D1 | An empty roster hid Recent checks and saved results | ACCEPT | The empty message now replaces only the start card. Checks, results and student history stay reachable |
| D2 | Switching weeks during extraction left the other week stuck on Loading | ACCEPT | Week switching is locked while a plan is being read or saved |
| D3 | Skip day, Remove and the edit Save could overlap whole-week saves | ACCEPT | Every planner change is blocked while a save or extraction is running |
| D4 | The student sheet didn't contain keyboard focus | PARTIALLY ACCEPT | Tab and Shift+Tab are trapped inside the sheet. Not adopted: making the background inert, since touch can't reach behind the full-screen overlay |

### Preview testing by Greg, signed in (2026-10-03)

Run on the `feat/core-redesign` preview (commit `c4f62e3`) against the real Supabase project. This is the write path Claude could not verify.

An earlier attempt the same evening looked like a regression (cycling statuses, several labels per student, note-only turning into Got it). It was run on the `main` branch address, which is the old app. Supabase request logs showed every request came from that address and none touched the new tables. Nothing was wrong with this branch and no code changed.

| Area | Result |
| --- | --- |
| Class grid and quick sheet | Passed |
| Results after a refresh | Passed: they persist |
| Needs help | Passed: stays Needs help |
| Not here | Passed: stays Not here |
| Note-only save | Passed: the note persists and the student does not become Got it |
| Mark remaining as Got it | Passed |
| Rechecks, results, student history | Passed ("appears correct") |
| Weekly lesson-plan upload with a real plan | Passed once **Next week** was selected. Math extracted correctly |

**The plan upload was not a parser fault.** The first try showed "No lessons found". The test ran on Saturday Oct 3, and the Oct 5 to 9 plan was uploaded under **This week**. On a weekend, This week is still the week that just ended (Sep 28 to Oct 2, from `getWeekStart` in `src/App.tsx`). The importer keeps only lessons dated inside the selected week, so finding none was correct. The same plan imported under Next week.

**Counts-only database check after the test** (no names, notes or other content read):

| Check | Result |
| --- | --- |
| `checks` | 3 rows across 2 classes, 1 of them a recheck. All 3 open, 0 ended |
| `check_results` | 26 rows: 22 Got it, 2 Check again, 1 Needs help, 1 Not here |
| One row per student per check | Holds: no duplicates |
| Rows outside a check's participant list | None |
| Rows with a note | 1, and its result is now Got it. A note-only student counts as unchecked, so Mark remaining fills it (7.2). That fits the note-only test followed by Mark remaining, but counts alone can't prove the order |
| `week_plans` | Newest week is 2026-10-05, the Next week upload |
| Legacy `lessons` and `checkins` | Last written 00:26 UTC, before the first new check at 00:35 UTC. That was the mistaken test on the old app. The new build wrote nothing to them |

**How a check ends** (Greg couldn't find it during the test):
- A check ends only through `endCheck` in `src/lib/checksDb.ts`, called from `finishCheck` in `src/components/Workspace.tsx`. Two buttons reach it:
  - **Done for now** on the results screen: from the grid, scroll below the last student, tap View results, then Done for now.
  - **End it and start new** on the class home: tap Start a new check under Continue check, then confirm.
- The back control on the grid (`‹ class name`) only returns to the class home. It writes nothing, and the check stays open as Continue check. That is the reviewed design (deviations table above). The 3 open and 0 ended checks in the database agree.
- At the time of the test the action existed, but it was one scroll and two taps from the grid, behind a button named View results.

**Follow-up fix: Done for now on the grid (2026-10-03, Greg's instruction)**
- The grid header now has a **Done for now** button, top right, across from the back control. It calls the same `doneForNow`, `finishCheck` and `endCheck` as before. No new write path. The results screen keeps its own Done for now.
- It is disabled while the focus is being edited, so a typed but unsaved focus isn't lost to a check that can no longer be edited.
- `doneForNow` now also closes the focus editor and the Mark remaining confirm box when a check ends, the same two resets the back control does. Without it, a confirm box left open would reopen on the next check.
- No confirm step, matching the results-screen button. Ending loses nothing: saved results stay and unchecked students stay Not checked.
- Checks: lint unchanged (4 errors, all in `MicButton.tsx`), 40 tests pass, build passes. Browser run of the new button, in demo and against a mocked Supabase: 24 of 24, including the exact request (one update with only `ended_at`), ended on another device, a failed request, a long class name and 320px width. The two earlier walkthroughs still pass (59 of 59, 58 of 58).
- Codex diff review (1 file, 12 lines added, 4 removed): pass 1 replied `NO_ACTIONABLE_FINDINGS`. No second pass needed.
- Found, not changed: the grid header is marked sticky but scrolls away with the page, because `body`, `#root` and the app root all set `overflow-x: hidden`. That was already true. So the button is on screen when the grid opens and leaves with the header on a long class.

**Two-device test: passed (2026-10-03, on the build with the grid button, commit `f0b8cca`)**
- Greg ended a check with Done for now on one device, then tried to Save on the other without refreshing. The sheet stayed open with "Not saved. Try again."
- Counts-only database check right after (no names, notes or other content read):
  - `checks`: 4 rows, 2 open and 2 ended. Before the test it was 3 rows, all open. The newest was ended at 02:14 UTC.
  - `check_results`: still 26 rows, and the newest row is from 00:44 UTC, the first test. The refused Save wrote nothing.
  - No result row was created after its check ended. The spread is unchanged: 22 Got it, 2 Check again, 1 Needs help, 1 Not here. Still no duplicates.
  - The check started and ended during the test has 0 result rows.
  - Legacy `checkins`: last write still 00:26 UTC. Nothing from this build.
- This is the first run of the real signed-in path for the grid's Done for now button and for the ended-check refusal from the app.

- The request log shows the same thing at the HTTP level: the check was ended at 02:14:34 UTC (200), and the Save from the other device 8 seconds later was refused with 403.

**Airplane-mode Save: passed, per Greg (2026-10-03).** This one can't be checked from the server, because the request never leaves the phone. The database shows no stray writes.

**Delete Class: passed (2026-10-03).** Greg deleted one class on the preview. Verified from the request log and counts-only queries:
- One class delete in the last 24 hours: 02:28:31 UTC, status 204, sent from the `feat/core-redesign` preview.
- Just before it, a check was created in that class (02:27:44, 201) and one result saved in it (02:27:49, 201). Both are gone: no check started and no result created at or after 02:27:40 remains.
- Rows still pointing at the deleted class id: 0 in `classes`, `student_classes`, `checks`, `week_plans`, `lessons` and `skills`. No result is left without its check.
- The other classes are untouched: `check_results` is still 26 rows, newest from 00:44 UTC.
- No class has the deleted class's name now. One other class with a similar name remains (24 students, no checks). Greg to confirm that is a different class he meant to keep.
- By design (comment above the delete in `src/App.tsx`), Delete Class leaves student records in place. 5 student records now belong to no class, all created before tonight, and none has a result. Counts can't say how many came from this class.

**Still to test before merge:**
- Planner: the vague-plan "Lesson N" fallback, Edit, Add, Remove, Skip day with push-back
- Phone trial with a real class, standing and one-handed


## Codex review log (fresh cycle, v2)

### Pass 1 (2026-10-02)

| # | Severity | Finding (short) | Verdict | Reason / what changed |
| --- | --- | --- | --- | --- |
| F1 | BLOCKER | Roster student names still navigate to the deleted History screen | PARTIALLY ACCEPT | Confirmed at `src/components/RosterScreen.tsx:5-7`, `:183`. The smaller fix is that names become plain text and the three History props are removed (7.5). Not adopted: wiring the roster into the workspace's student history, which the core loop doesn't need |
| F2 | BLOCKER | Skip Day push-back strands the shifted Friday entry in the wrong week's row | ACCEPT | Confirmed: `skipDay` shifts via `nextISOWeekday` (`src/App.tsx:1332`) but saves under the current `week_start` (`:1274`), and the loader reads only the current week (`:842`). Push-back is now limited to the selected week, the overflow is dropped with explicit confirm text, and other weeks' rows are never touched (7.1). Tested in section 11 |
| F3 | IMPORTANT | PlanScreen has no `isDemo` handling | PARTIALLY ACCEPT | The plan was silent, but demo can't reach Plan today (`src/App.tsx:1629`, `:1779`). The smaller fix states that Plan stays unreachable in demo, PlanScreen never mounts there, and the demo focus comes from a fixture. Not adopted: local demo persistence for the planner. Section 11 adds a demo-isolation check |
| F4 | IMPORTANT | Older open checks can't be resumed | ACCEPT | Tapping an Open check in Recent checks now resumes recording by id (7.4). Tested in section 11 |
| F5 | IMPORTANT | RLS verification lacked fixtures and failure isolation | ACCEPT | Section 9 is now a concrete script: privileged fixtures owned by Greg's existing id (no `auth.users` writes), a savepoint per expected error, 0-row assertions for RLS-filtered update/delete, other-identity and anon checks, then rollback and a residue count |
| F6 | NICE TO HAVE | Drop Step 3 legacy-table cleanup from scope | PARTIALLY ACCEPT | Rejected removing it: Greg explicitly wants that end state once the new system is proven. It was already outside this implementation and stays a separate, later approval. Accepted the dependency point: Step 3 now requires a live `pg_depend`/`pg_constraint` check, not just a source grep |

### Pass 2 (2026-10-02, final)

Codex accepted every pass-1 verdict, including the partial accepts and the F6 pushback, and reported no BLOCKER. It found two new issues, both IMPORTANT. Both were applied after the final pass and are not Codex-verified. There will be no third pass.

| # | Severity | Finding (short) | Verdict | Reason / what changed |
| --- | --- | --- | --- | --- |
| P2-F1 | IMPORTANT | Edit can't fix a lesson the AI put under the wrong subject | PARTIALLY ACCEPT | Correct: Edit only changed focus and label, and the risk table overclaimed. The fix is smaller than a move operation: every day lists all of the teacher's class subjects, with Add focus on empty ones and Edit/Remove on filled ones. Correcting means Add on the right subject plus Remove on the wrong one. No collision handling is needed, and it also covers missed subjects. Tested in section 11 |
| P2-F2 | IMPORTANT | Phase 0 doesn't cover the columns the Step 1 fixtures need | ACCEPT | Phase 0 item 1 now inspects every column's nullability and default on `classes` and `students`. The `student_classes` fixture is dropped, since no policy under test checks membership |

## Codex review log: focused Step 1 review (migration, Phase 0, verification)

Scope: section 6 SQL, the Phase 0 appendix and section 9 only, with section 7.2 as context. A separate cycle from the v2 plan review above.

### Pass 1 (2026-10-02)

| # | Severity | Finding (short) | Verdict | Reason / what changed |
| --- | --- | --- | --- | --- |
| M1 | BLOCKER | Verification inserted fixtures into the existing `classes`/`students` tables | PARTIALLY ACCEPT | Valid, and it contradicted the stated rule that Step 1 not touch existing tables. Fixed the smaller way: fixtures are existing class/student ids read inside the block, so only the new tables are written, and those writes are rolled back. Not adopted: a separate isolated database, which isn't needed once no existing table is written |
| M2 | BLOCKER | SAVEPOINTs can't recover errors inside one submitted script | ACCEPT | Correct: the connector submits a single statement, so the first error aborts everything after it. Section 9 B is now one `DO` block with a per-refusal `EXCEPTION WHEN <sqlstate>` handler. It always ends in `RAISE EXCEPTION`, which guarantees rollback, and the result is read from the message |
| M3 | IMPORTANT | Verification didn't exercise the 7.2 write forms or prove that omitted fields survive | ACCEPT | Added the exact SQL forms: note-only merge preserving `result`, `ON CONFLICT DO NOTHING` preserving an existing result, conditional update (0 rows when set, 1 row after a clear), and `RETURNING` under the SELECT policy. Client-generated SQL stays a Step 2 check (section 11, new "client SQL forms" item) |
| M4 | IMPORTANT | The random `user_id` test could pass via the FK, not RLS | ACCEPT | It now asserts SQLSTATE `42501` for two cases: a foreign identity writing with the owner's `user_id`, and a foreign identity on the owner's class (the class-ownership clause). It asserts `23503` specifically for the cross-class root. RLS WITH CHECK runs before the FK trigger, and the opposite order is reported as a failure |
| M5 | IMPORTANT | Effective privileges, including no TRUNCATE, weren't verified | ACCEPT | Section 9 A adds `has_table_privilege` assertions: `authenticated` CRUD only with no TRUNCATE/REFERENCES/TRIGGER, `anon` nothing, `service_role` CRUD. TRUNCATE is never executed |
| M6 | IMPORTANT | Phase 0 didn't record referenced unique keys or `students` access | ACCEPT | The PKs were already in the Phase 0 constraint query, just unrecorded. Ran one more metadata query (within the approved Phase 0 scope): `authenticated` and `service_role` hold CRUD on `classes` and `students`, and the connection role `postgres` is a member of `authenticated` and `anon`. Recorded as appendix items 7-8 |

### Pass 2 (2026-10-02, final)

Codex replied `PLAN_CLEARED`: M1 to M6 are resolved and the revision introduced nothing new.
