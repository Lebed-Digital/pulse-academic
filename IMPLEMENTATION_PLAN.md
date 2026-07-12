# Implementation Plan: Small Group Pull List + Understanding Signals

Goal: teachers can see at a glance whether the class is understanding the lesson, and at the end of the day get an actionable list of small groups to pull for a quick mini lesson.

This plan is written for an implementing model. Work through phases **in order**. Each phase is independently shippable: finish it, verify it, commit and push it before starting the next one.

---

## Ground rules (read before writing any code)

1. **Stack:** React 19 + TypeScript + Vite + Supabase + Tailwind CSS v4. Follow the existing code style in each file you touch.
2. **Dark theme is hardcoded.** This app uses inline hex styles (`#161618`, `#f0f0f2`, etc.) and Tailwind color classes. NEVER use Tailwind `dark:` variants. Match the exact style objects used by sibling components (see `surface`, `inputStyle`, `chipBase` in `src/components/ReportsScreen.tsx`).
3. **No em dashes in any UI string.** Use commas, colons, or periods.
4. **Demo mode exists.** `isDemo` is threaded through the app. Any new feature that writes to Supabase must skip the write when `isDemo` is true (see how `tap()` and `confirmAllGotIt()` in `src/App.tsx` handle it). New read-only UI should still work in demo mode using the local state.
5. **Verify each phase:** `npm run lint` must pass, `npx tsc -b` must pass, and test the golden path in the browser with `npm run dev` before committing.
6. **Commit format:** one commit per phase, message like `feat: phase 1 - unmarked student state`. Chain `git add`, `git commit`, `git push` without stopping.

---

## Architecture crash course (how the data flows today)

Read this carefully. Do not guess; everything below was verified against the code.

- `src/App.tsx` (~1,770 lines) holds ALL state and logic. Screen components in `src/components/` are dumb renderers that receive props (prop interfaces live in `src/types.ts`).
- **Statuses:** `Status = 'got-it' | 'almost' | 'needs-help' | 'absent'` (`src/types.ts`). `STATUS_CYCLE` in App.tsx defines the tap order.
- **Tracker flow:** teacher starts a lesson (`startLessonByTitle`, App.tsx ~line 839), then taps student circles. `tap()` (~line 912) cycles the status and upserts rows to the `checkins` table via `buildCheckinRows()` (~line 592). Key detail: **if the lesson has skills** (from the parsed week plan), one checkin row is written **per skill** with `onConflict: 'lesson_id,student_id,skill'`. If no skills, a single row with `skill: null`.
- **Default status trap:** `studentStatuses[s.id] ?? 'got-it'` appears everywhere. An untapped student is displayed as got-it and has NO row in the database. Rows only exist once a student is tapped or "Save All Got It" is pressed.
- **History:** `historyData: HistoryRow[]` is loaded in a `useEffect` and refreshed by bumping `historyVersion`. Each row: `{ class_id, class_name, student_id, student_name, lesson_id, lesson_title, date, status, note?, skill? }`.
- **Reports:** `reportData` memo (App.tsx ~line 423) filters `historyData` to non-got-it rows in the selected date range, groups per class into `needsSupport` / `checkIn` / `absent` buckets (`ReportClass` in types.ts). Rendered by `src/components/ReportsScreen.tsx`.
- **Dismissing:** `dismissCheckin()` (~line 963) flips a row's status back to `got-it` locally and upserts. `clearLesson()` (~line 976) does it for a whole lesson. ReportsScreen wraps both in a 3-second undo pattern (`pendingDismiss` / `pendingClear`).
- **At-risk sorting:** memo at App.tsx ~line 1383 scores each student's last 10 non-absent rows (got-it=3, almost=2, needs-help=1); average < 1.8 puts them in `atRiskStudentIds`, which TrackerScreen renders as a "Needs attention" section on top.
- **AI calls:** `src/lib/groq.ts` calls a Supabase edge function `groq-proxy` (model `llama-3.3-70b-versatile`). Pattern: build prompt, `groqChat()`, regex out the JSON, `JSON.parse`. Copy this pattern for any new AI function.
- **Week plan skills:** `savedPlan.schedule[dateISO][subject].skills?: string[]` from the parsed lesson plan. `getActiveLessonSkills()` (~line 577) resolves skills for the active lesson.

---

## Phase 1: "Unmarked" visual state on the Tracker (data integrity fix)

> **STATUS: DONE** (commits efa190a and 3d8ee9d). Skip this phase. Note for later phases: an untapped student is `studentStatuses[id] === undefined`, displayed as `'unmarked'` (gray). The style maps in App.tsx are typed `Record<Status | 'unmarked', string>`. Start with Phase 2.

**Problem:** an untapped student renders identically to a confirmed got-it student. A teacher who never got to a kid records them as understanding the lesson, so they can never appear on the pull list. Also, `confirmAllGotIt()` (App.tsx ~line 941) currently flips **almost and needs-help students back to got-it**, silently erasing flags the teacher set during the lesson.

**Design decision (do not deviate):** "unmarked" is a **UI-only state**, not a new database status. Absence of a key in `studentStatuses` = unmarked. No schema change.

### Changes

1. **App.tsx:** When a lesson starts (`startLessonByTitle`), `studentStatuses` for the new lesson should reflect only rows that actually exist (it already loads saved checkins for the lesson; verify this and keep it). Do NOT seed untapped students with `'got-it'`.
2. **`tap()` cycle:** first tap on an unmarked student sets `'got-it'`, then continues through the existing `STATUS_CYCLE`. Cycling past the last status returns to `'got-it'`, not to unmarked (once marked, always marked).
3. **TrackerScreen.tsx:**
   - Where status is read as `studentStatuses[student.id] ?? 'got-it'` (line ~198 and the counts block ~lines 158-162), treat a missing key as `'unmarked'`.
   - Unmarked circle style: neutral gray, visually distinct from the emerald got-it style. Use `background: 'rgba(255,255,255,0.08)'` with text color `#8b8b9a` and no ring. Add entries to the style maps OR branch locally in TrackerScreen; prefer adding an `'unmarked'` key to `STATUS_INITIAL_BG` / `STATUS_RING` / `STATUS_CARD` in App.tsx with the record types widened locally (do NOT add `'unmarked'` to the `Status` union in types.ts, since that type maps to database values).
   - Counts bar: add a gray count chip `N Unmarked` that only renders when the count is > 0.
4. **`confirmAllGotIt()`:** ALREADY FIXED in commit efa190a. It now flips only students with no entry in `studentStatuses` (the untapped ones) and leaves almost/needs-help/absent flags alone. Do not change that logic. Your only remaining task here: rename the button label in TrackerScreen to `✓ Mark rest Got It` and show it when at least one student is unmarked (instead of the current `gotIt > 0` condition).
5. **Demo mode:** demo taps only touch local state; keep that behavior, just apply the same unmarked default.

### Verify

- Start a lesson: all circles gray. Tap once: emerald got-it. Cycle through almost, needs-help, absent, back to got-it.
- Mark two students needs-help, press "Mark rest Got It": the two stay red, everyone else turns emerald, Supabase gets got-it rows only for previously unmarked students.
- Reports for today still shows the two flagged students.

---

## Phase 2: Small Group Builder (the core feature)

> **STATUS: DONE.** View toggle state (`reportView`) lives in App.tsx (lifted for Phase 3), persisted in localStorage key `reportView`. Grouping logic in `src/lib/groups.ts` (`buildPullGroups`; students carry `lessonTitle` for the AI context). `suggestMiniLesson` in groq.ts. `buildGroupsText()` in App.tsx next to `buildReportText()`. Groups UI + catch-up list + mini lesson panel in ReportsScreen.tsx (absent rows extracted to `renderAbsentSection`). Start with Phase 3.

**Goal:** the Reports screen gains a second view that converts flagged students into ready-to-pull small groups, grouped by skill, capped at a realistic table size, with a one-tap "retaught" action per group.

### 2a. View toggle on Reports

In `ReportsScreen.tsx`, add a two-chip toggle above the results (below the filters card): `List` | `Groups`. Style like the existing filter chips (teal active, `chipBase` inactive). Persist choice in `localStorage` key `reportView`. `List` renders the existing UI unchanged.

### 2b. Grouping algorithm

Add a pure function (new file `src/lib/groups.ts` so it is testable and keeps App.tsx from growing):

```ts
export type PullGroup = {
  key: string            // skill or lesson title used for grouping
  label: string          // display label
  students: { id: string; name: string; status: 'needs-help' | 'almost'; lessonId: string; skill: string | null }[]
}

export function buildPullGroups(reportData: ReportClass[], showSkills: boolean): { classId: string; className: string; groups: PullGroup[] }[]
```

Rules:

1. Work per class from `reportData` (already filtered to the selected range).
2. Collect every `needs-help` and `almost` lesson entry from `needsSupport` and `checkIn` students. Ignore `absent` entries (absent kids get a catch-up list, see 2d).
3. Group key: `skill` if `showSkills` is true and the entry has a non-empty skill, otherwise the lesson `title`.
4. Deduplicate: a student appears at most once per group (a student can legitimately appear in two different groups for two different skills).
5. Sort within a group: `needs-help` students first, then `almost`, alphabetical within each.
6. Sort groups by number of needs-help students descending, then total size descending.
7. **Cap at 6 students per group.** If a group exceeds 6, split into `Label (1 of 2)`, `Label (2 of 2)`, keeping needs-help students concentrated in the first split.

### 2c. Groups view UI

For each class (same card style as List view, reuse `surface`):

- Group header: label + count, e.g. `Fractions on a number line · 4 students`.
- Student rows: name with a small colored dot (red for needs-help, yellow for almost).
- Two buttons per group:
  - `✓ Pulled and retaught`: calls the existing `dismissCheckin()` for every student entry in the group (each with its `lessonId` and `skill` and correct `fromStatus`), wrapped in the same 3-second undo pattern already implemented in ReportsScreen (one pending state for the whole group, single Undo chip).
  - `💡 Mini lesson` (Phase 2e below; render the button now, wire it in 2e).
- Empty state for Groups view: reuse the existing "No students flagged for this period." block.

### 2d. Catch-up list

Below the groups in each class card, if the class has `absent` students in range, render a compact `Missed lessons` section: student name + lesson titles, with the existing per-row dismiss (blue check, "Mark as caught up"). This can reuse the absent-rendering JSX from List view; extract it into a small local component to avoid duplication.

### 2e. AI mini lesson suggestion

Add to `src/lib/groq.ts`, following the exact pattern of `suggestExitTickets`:

```ts
export type MiniLesson = { focus: string; warmUp: string; activity: string; check: string }
export async function suggestMiniLesson(skillOrTopic: string, lessonTitles: string[], studentCount: number): Promise<MiniLesson>
```

Prompt requirements: expert elementary/middle school interventionist; a 5 to 10 minute small group re-teach for `studentCount` students who did not master `skillOrTopic` (context: lesson titles); return ONLY a JSON object with keys `focus` (one sentence: the single misconception or gap to target), `warmUp` (under 200 chars, 1 minute activation), `activity` (under 300 chars, the core guided practice with concrete example content), `check` (under 200 chars, how to confirm they can rejoin the class). Plain text, no LaTeX, no markdown.

UI: tapping `💡 Mini lesson` on a group shows a loading state on the button, then expands an amber panel inside the group card (match the exit ticket panel styling in TrackerScreen: `rgba(251,191,36,0.07)` background) with the four fields labeled `Focus / Warm up / Activity / Check`. Cache the result in component state keyed by group key so re-tapping does not re-fetch. Handle errors with the same fallback pattern as exit tickets ("Could not load suggestion. Check your connection."). Hide this button entirely in demo mode.

### 2f. Copy report includes groups

When the Groups view is active, `copyReport` should copy a groups-formatted text instead. Add `buildGroupsText()` next to `buildReportText()` in App.tsx (or pass groups data down; keep the clipboard write in one place). Format:

```
Small Group Plan - Today (Jul 11)

── Period 3 Math ──
Group 1: Fractions on a number line (4 students)
  • Maya R (needs help)
  • DJ T (needs help)
  • Chris P (almost)
  • Sam W (almost)

Catch-up (absent):
  • Lena K - Intro to decimals
```

No em dashes in this output; the `──` box-drawing characters above match the existing `buildReportText` style and are fine.

### Verify

- Flag 5 students across 2 skills in one lesson, open Reports > Today > Groups: correct grouping, needs-help first, sorted by severity.
- `Pulled and retaught` dismisses all entries, Undo within 3 seconds restores them.
- Mini lesson generates and renders; second tap reuses cache.
- Copy button produces the groups text.
- List view is pixel-identical to before.

---

## Phase 3: End-of-day wrap-up card on the Tracker

> **STATUS: DONE.** `todayFlaggedCount` memo + `goToTodayGroups` in App.tsx (passed via screenProps, typed in `TrackerScreenProps`). TrackerScreen renders the wrap-up card above the no-lesson empty state and a slim teal pill under the student grid when a lesson is active. Start with Phase 4.

**Goal:** the pull list finds the teacher instead of hiding in Reports.

### Changes

1. In App.tsx, compute a memo `todayFlaggedCount`: distinct students in `historyData` where `date === today`, `status` is `needs-help` or `almost`, across ALL classes (not just the selected one).
2. Pass `todayFlaggedCount` and a `goToTodayGroups` callback to TrackerScreen. The callback: `setReportRange('today')`, `setReportClassId('all')`, set the report view to Groups (persist via the same localStorage key or lift that state to App.tsx in Phase 2; lifting is cleaner, do that in Phase 2), then `setScreen('reports')`.
3. In TrackerScreen, render a wrap-up card when `todayFlaggedCount > 0` AND there is no `activeLesson` (the natural between-lessons / end-of-day moment). Place it above the "Select a lesson" empty-state block. Content: `N students flagged today` headline, subtext `Tap to build your small groups for tomorrow.`, teal chevron button `View pull list`. Card style: `surface` look with a subtle teal left border (`border-left: 3px solid #14b8a6`).
4. Also render a slim version at the bottom of the student grid when a lesson IS active (a one-line pill under the grid: `N flagged today · View pull list`), so teachers who keep a lesson open all day still see it.

### Verify

- Flag students in a lesson, tap Change to close the lesson: card appears with the correct count and navigates to Reports > Today > Groups with All classes selected.
- Zero flags: no card anywhere.

---

## Phase 4: Live understanding meter during the lesson

> **STATUS: DONE.** All in the counts-bar block of TrackerScreen.tsx: bar + `{pct}% got it` label from marked students only, red threshold line at `pct < 50 && marked >= 5`, muted "Tap circles" line when nothing is marked yet. Start with Phase 5.

**Goal:** glanceable "is this landing?" signal while teaching.

### Changes

All in `TrackerScreen.tsx`, inside the existing counts-bar block (~line 158).

1. Compute from present, **marked** students only: `marked = gotIt + almost + needsHelp` (exclude absent and unmarked). `pct = Math.round((gotIt / marked) * 100)`; guard `marked === 0`.
2. Render a thin horizontal bar (h-1.5, rounded-full) directly under the counts row inside the same card: filled portion width `pct%`, color emerald when `pct >= 70`, yellow when `40 <= pct < 70`, red below 40. Use the same color values already in the file (`bg-emerald-400`, `bg-yellow-400`, `bg-red-400`).
3. To the right of the bar, a tiny label: `{pct}% got it` in the bar's color.
4. When `pct < 50` AND `marked >= 5` (enough signal), show one quiet line under the bar in red-400 at 11px: `More than half the class is stuck. Consider pausing to reteach.` No animation, no toast, nothing blocking.
5. When `marked === 0`, show `Tap circles as you check in with students.` in the muted color `#5a5a6a` instead of the bar.

### Verify

- Mark statuses and watch the bar and threshold line update live at 80%, 60%, 40%.
- Absent and unmarked students do not affect the percentage.

---

## Phase 5: Repeat-struggler escalation

> **STATUS: DONE.** `repeatStrugglers` memo in App.tsx (above the at-risk memo; keyed by student id, worst group by distinct days, skill label else class subject). Keys unioned into `atRiskStudentIds`. Threaded through screenProps and typed on both Tracker and Reports prop interfaces. TrackerScreen: `Nx` pill top-left of the card. ReportsScreen: `Nx this week` pill after the name; group members re-sorted (needs-help first, repeat strugglers first within status) in the `pullGroups` memo. Start with Phase 6.

**Goal:** surface "same kid, same skill, multiple days" because that is the student actively falling behind.

### Changes

1. New memo in App.tsx (near the `atRiskStudentIds` memo, ~line 1383): `repeatStrugglers: Map<string, { label: string; days: number }>` keyed by student id. Algorithm: for each student, take `historyData` rows with `status === 'needs-help'` in the **last 7 calendar days** (compare ISO date strings against a computed cutoff, consistent with how dates are handled elsewhere: plain `YYYY-MM-DD` string comparison). Group by `skill` when present, else by `class_id` + subject. If any group has rows on **2 or more distinct dates**, the student is a repeat struggler; store the group label (skill name, else the class subject) and the distinct-day count of the worst group.
2. TrackerScreen: for students in `repeatStrugglers`, render a small red badge on the card (top-left, mirroring the note dot at top-right): a tiny `2x` / `3x` pill, `background: rgba(239,68,68,0.15)`, `color: #ef4444`, 9px bold, with `title` tooltip `Needs help with {label} on {days} days this week`.
3. ReportsScreen Groups view: within a group, repeat strugglers get the same `Nx this week` pill after their name, and sort above other needs-help students in the group.
4. Also feed it into the existing at-risk logic: union `repeatStrugglers` keys into `atRiskStudentIds` so these students always appear in the "Needs attention" section of the grid.

### Verify

- Seed a student with needs-help rows on the same skill across 2 different dates (use the app on two lessons, or temporarily adjust a row date in Supabase). Badge appears in the grid and Groups view, student joins the Needs attention section.
- A student flagged twice on the SAME date does not get the badge.

---

## Phase 6: Close the loop on remediation

> **STATUS: DONE.** Migration `add_retaught_count_to_checkins` applied to production (column confirmed via list_tables). `retaught_count` threaded through the history select, HistoryRow, ReportStudent lessons, and PullGroupStudent (`retaughtCount`, dedupe keeps max). `markRetaught()` in App.tsx next to dismissCheckin (skips Supabase write in demo). ReportsScreen: inline Got it now / Still needs work / ✕ chooser on needs-help and almost rows (absent keeps one-tap dismiss) and on the group-level Pulled and retaught button. Muted `retaught Nx` pills in both views; retaught students sort to the top of groups (in buildPullGroups, so copy text matches). Copy texts append `(retaught Nx)`. All 6 phases complete.

**Goal:** dismissing a flag records an outcome, so "still needs work" kids come back tomorrow and the app builds a re-teach history.

### Database migration (Supabase, run via MCP `apply_migration`)

```sql
alter table checkins add column if not exists retaught_count int not null default 0;
```

`checkins` is upserted on `(lesson_id, student_id, skill)`; the new column defaults to 0 for all existing rows. RLS: the table's existing policies cover the new column automatically (it is not a new table). Confirm with `list_tables` that the column landed.

### Changes

1. **Type:** add `retaught_count?: number` to `HistoryRow` in `src/types.ts` and include the column in the `checkins` select that populates `historyData` (find the select in the history-loading `useEffect` in App.tsx).
2. **Outcome choice UI:** in ReportsScreen (both views), tapping the dismiss check on a needs-help or almost entry no longer immediately dismisses. It flips the row into a compact inline chooser: `Got it now` (emerald chip) | `Still needs work` (yellow chip) | `✕` (cancel). The Groups view group-level `Pulled and retaught` button gets the same two choices applied to the whole group.
   - `Got it now`: existing behavior exactly (3-second undo, then `dismissCheckin`).
   - `Still needs work`: calls a new App.tsx function `markRetaught(studentId, lessonId, skill)` which upserts the row keeping its current status but with `retaught_count` incremented, and updates `historyData` locally. No undo needed (it is non-destructive).
   - Absent entries keep the current one-tap "caught up" dismiss, no chooser.
3. **Display:** in Reports (both views), entries with `retaught_count > 0` show a muted pill `retaught 1x` (or Nx) next to the lesson/skill label. In Groups view these students sort to the top of their group (they have been pulled before and are still stuck: highest priority).
4. **Copy text:** `buildReportText` and `buildGroupsText` append ` (retaught Nx)` to those students' lines.

### Verify

- Flag a student, go to Reports, tap the check, choose `Still needs work`: entry stays with a `retaught 1x` pill; Supabase row shows `retaught_count = 1` and unchanged status.
- Choose `Got it now` on another: dismisses with undo, exactly as before.
- Group-level action applies the choice to every member.

---

## Out of scope (do not build)

- Student self check-in / student devices.
- Any change to the `Status` union or the checkins status values.
- Push notifications or scheduled reminders.
- PDF export.

## Suggested order recap

| Phase | What | Size |
|---|---|---|
| 1 | Unmarked state + confirmAllGotIt fix | Small |
| 2 | Small Group Builder + AI mini lessons | Large (the feature) |
| 3 | Wrap-up card | Small |
| 4 | Live understanding meter | Small |
| 5 | Repeat-struggler badges | Medium |
| 6 | Remediation outcomes + migration | Medium |
