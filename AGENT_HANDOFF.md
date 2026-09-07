# Pulse Academic Handoff

## Session: September 7, 2026 (later) — Product clarity audit, UX simplification pass, merged to main

This session picked up right after the relaunch evaluation session below (same day). Read this section in full before doing anything; the audit and both rounds of fixes it produced are done, reviewed, and now merged and deployed. **Signup is still intentionally paused** — do not reopen it. See "Next session task" at the bottom.

### What happened, in order

1. **Product clarity/usability audit.** Read every screen's actual source and copy end-to-end (Landing, Auth, Setup, App.tsx nav/state, Tracker, Plan, Reports, Roster, History, StudentProfileSheet, demo data) and produced a full written audit: current user journey, ranked confusing-things list, must-fix/should-improve/harmless-polish buckets. Key findings: Landing/Tracker copy oversold exit tickets as the main product instead of the understanding-tracking/reteach loop; Setup promised a "Settings" screen that doesn't exist; status vocabulary was inconsistent across screens ("Needs Support" vs "Needs Help", "Worth a Check-In" vs "Almost"); Reports defaulted to the flat List view instead of the more useful Groups view; the reteach-outcome checkmark gave no hint it opened a 3-way chooser; Plan screen front-loaded a lot of power-tooling (Swap/Skip/Copy) before a first-time teacher needed any of it. Nothing was implemented until Greg approved a scoped list.
2. **Round 1 fix pass (approved scope only, commit `bf67bc7`):** Setup copy fixed to say "Roster" not "Settings"; status vocabulary standardized to Got It / Almost / Needs Help / Absent everywhere including the Copy Report clipboard text; Reports Groups view becomes the soft default whenever there are flagged students (an explicit tap on List/Groups always wins and persists — implemented as a derived render-time value, not a ref-in-effect, to satisfy this React version's `react-hooks/set-state-in-effect` / `react-hooks/refs` lint rules); added a one-line List vs Groups explainer; replaced the unlabeled checkmark icon with self-explanatory "Retaught?" / "Checked in?" / "Pulled and retaught?" text buttons; added a first-run nudge on Tracker's empty state ("Start here: name today's lesson and tap Start..."); reworded the exit-ticket mention to read as a supporting feature, not the main reason to use Plan; Plan screen's Swap/Skip/Copy controls collapsed behind "More options ▾" / "More day options ▾", collapsed by default, Edit stays always visible.
3. **Manual preview click-through found two real bugs**, which became a scoped follow-up (commit `98d8fa6`):
   - **Setup screen name/subject confusion** — no field labels, so typing "ELA" as a class name right above an "ELA" subject chip was genuinely ambiguous. Fixed with "Class name" / "Subject" labels and clearer placeholder/helper copy. No schema change — `classes.name` and `classes.subject` were already separate columns; this was purely a labeling gap.
   - **Tab-switch data loss (real pre-relaunch bug, now fixed).** Root cause: `Root.tsx`'s `onAuthStateChange` listener unconditionally set `state` to `'app'`/`'auth'` on every auth event, including the harmless session-refresh Supabase's client fires when a tab regains focus. This bounced a teacher out of `'setup'` into `'app'`, which immediately detected zero classes and routed back to `'setup'` — but the round trip unmounted `SetupScreen` and wiped its local form state. Fixed by keeping `state` at `'setup'` when a same-session event fires and a session is still present; sign-out still correctly routes to `'auth'`. **Verified rigorously**: reproduced the exact failure against the pre-fix code using a real `supabase.auth.refreshSession()` call (not a simulated DOM event) — class name reset to `""`, subject reset to default "Math", screenshotted — then confirmed the fix prevents it, then confirmed a full signup → fill → tab-switch → continue → save flow persists the class correctly to the database.
   - **Added Print / Save as PDF to Reports** (small, isolated, no library): a `#pulse-print-area` marker around the results block plus one `@media print` CSS rule in `index.css` (the only actually-imported stylesheet — `App.css` was already dead/unimported, discovered and left alone, not touched). Hides header/nav/all interactive buttons, forces white-background/black-text (had to use `#pulse-print-area * { ... !important }` to beat the app's inline dark-theme styles, which a scoped class selector alone could not override). Verified via Playwright print-media emulation on both List and Groups views — clean, readable, no wasted ink.
4. **Both rounds merged to `main` and deployed.** Branch `ux/pulse-relaunch-simplification` (2 commits: `bf67bc7`, `98d8fa6`) merged with `--no-ff` as merge commit **`6066428d71ba64fd861c850abab22fcbb1608143`**, pushed to `origin/main`, auto-deployed by Vercel to production (`prj_PkMDvw81pt7S4yTkGff9zozedpDc`, deployment `dpl_4dVX8KTmW8EAPspiFgZu5qD8AYzF`, confirmed `state: READY`, `target: production`). Greg manually click-through tested the deployed result: tab-switch fix confirmed working, Setup screen confirmed clearer, Print/Save as PDF confirmed producing a clean usable report.
5. **`npx tsc -b`, `npm run lint`, `npm run build` all clean at every step**, including on `main` post-merge. Lint baseline is unchanged from before this session (8 pre-existing problems: one `set-state-in-effect` error in an unrelated Plan-load effect, four `no-explicit-any` errors in `MicButton.tsx`, three `exhaustive-deps` warnings) — none of this session's work touched those or added new ones.

### Files touched this session

`src/Root.tsx`, `src/SetupScreen.tsx`, `src/App.tsx`, `src/components/HistoryScreen.tsx`, `src/components/PlanScreen.tsx`, `src/components/ReportsScreen.tsx`, `src/components/TrackerScreen.tsx`, `src/index.css`. Nothing in `supabase/`, no schema migrations, no AI/edge-function changes, no auth logic beyond the one `Root.tsx` state-transition guard, no navigation restructure, no marketing site changes.

### Explicitly NOT done this session (still open, do not treat as forgotten)

- **Forgot Password email did not arrive during Greg's manual testing.** Needs investigation before relaunch — check the `resetPasswordForEmail` call in `AuthScreen.tsx` (`redirectTo: 'https://app.pulseacademic.com'`), Supabase's email provider/rate limits, and spam filtering. Not investigated yet this session; flagging only.
- **Marketing site (`pulse-academic-website`, separate repo) still has stale/exit-ticket-heavy positioning.** The in-app copy was rebalanced this session (see item 2 above) but the marketing site itself was explicitly out of scope every round and has not been touched.
- **Signup/relaunch remains intentionally paused.** Do not reopen it. That is a separate decision Greg makes explicitly, not a side effect of any of this UX work.
- **Duplicate React-key warning in `ReportsScreen.tsx`** (noted in the prior session below) remains open and non-blocking. Not investigated further this session.
- **Old Groq rollback path** (`groq-proxy` edge function + `GROQ_API_KEY` secret) remains deployed, untouched, per standing guidance not to remove it yet.

### Next session task

There is no pre-assigned next task. Read this handoff, then ask Greg what's next — likely candidates based on open items above are the Forgot Password email investigation, or a decision on marketing-site copy, or continuing to hold on relaunch. Do not reopen signups or touch the marketing site without an explicit go-ahead.

---

## Session: September 7, 2026 — Relaunch evaluation, Supabase reactivation, Groq → OpenAI AI migration

This session picked up "should we unpause Pulse Academic" and ran it all the way through a real technical verification and an AI-layer migration. Read this whole file before touching anything. Do not re-run the verification work below, it is done and confirmed; the next task is different (see "Next session task").

---

## 1. Current product status: technically working

Everything below was verified for real this session, not assumed: live Supabase project, real signup, real browser (Playwright), real AI calls, real screenshots.

- **Supabase project** (`zhkgdbjhcignpcspllso`, "Pulse-academic") is `ACTIVE_HEALTHY`. It had gone `INACTIVE` from disuse; Greg reactivated it mid-session.
- **All 8 tables verified intact**: `classes`, `students`, `student_classes`, `lessons`, `checkins` (including the `retaught_count` column from the earlier 6-phase feature build), `week_plans`, `skills`, `skill_mastery`, `subject_mappings`. No schema drift from the pause.
- **RLS verified**: every table has an owner-scoped policy tied to `auth.uid()` (or, for `student_classes`, an indirect ownership check through `students`). No wide-open tables. Security/performance advisors show only pre-existing, non-blocking items (missing indexes on some FKs, RLS calling `auth.uid()` per-row instead of `(select auth.uid())`, leaked-password-protection toggle off) — cosmetic/tuning, not launch blockers.
- **Signup/auth verified**: real signup through the UI, `mailer_autoconfirm: true` on this project so there is no email-click step blocking activation, login/session handling all work.
- **Class/roster setup verified**: class creation + bulk student paste both write correctly to `classes`/`students`/`student_classes`.
- **Lesson-plan workflow verified**: PDF/Word/paste upload, AI parsing into a structured week schedule, subject-mapping step, manual edit/swap/skip/undo — all functional.
- **Daily got-it/almost/needs-help/absent grid verified**: tap-to-cycle works, every status change correctly upserts to `checkins`.
- **Reteach/small-group flow verified**: List and Groups views in Reports both render correctly from real data; needs-help/almost students grouped by lesson; absent students correctly routed to a separate "Missed lessons" catch-up section.
- **Exit-ticket generation verified**: now working (was broken at start of session, see AI migration below).
- **Mini-lesson generation verified**: now working (same root cause and fix as exit tickets).

## 2. AI migration completed: Groq → OpenAI

**Why:** Groq had silently retired the hardcoded model (`llama-3.3-70b-versatile`) — confirmed directly against the live edge function (`404 model_not_found`). Even `llama-3.1-8b-instant` was gone too; Groq's available lineup on this account had shifted meaningfully. This broke every AI feature (exit tickets, mini-lessons, lesson-plan parsing, student-name parsing all share one code path). Root cause was a stale model string, not a secrets or deployment problem — the Groq key and `groq-proxy` function both still worked correctly.

**Decision:** Greg chose to migrate the whole AI layer to OpenAI properly rather than patch the Groq model name and migrate again later. Model chosen: `gpt-5.6-luna` (OpenAI's small/fast tier, native structured outputs, `reasoning_effort` support down to `none`, already in production use in `shorthand-website` on the same Lebed Digital OpenAI account pattern — confirmed via `lib/ai-config.ts` and its API routes there before writing any Pulse Academic code).

**What changed:**
- **New edge function:** `supabase/functions/openai-proxy/index.ts` — generic proxy to `api.openai.com/v1/chat/completions`, reads `OPENAI_API_KEY` from Supabase edge function secrets. Deployed, `ACTIVE`.
- **New shared client AI layer:** `src/lib/ai.ts` — replaces the old `src/lib/groq.ts` (deleted). One shared `openaiChat()` transport function, all four AI features call through it.
- **All four exported function signatures preserved exactly**, so no React component needed logic changes, only import paths:
  - `parseLessonPlan(text, weekStart): Promise<WeekSchedule>`
  - `parseStudentNames(text): Promise<string[]>`
  - `suggestMiniLesson(skillOrTopic, lessonTitles, studentCount): Promise<MiniLesson>`
  - `suggestExitTickets(lesson): Promise<ExitTicket[]>`
- **Model:** `gpt-5.6-luna`, `reasoning_effort: "none"` (confirmed via `usage.completion_tokens_details.reasoning_tokens === 0` on every real call — the setting is actually being honored, not silently ignored).
- **Strict structured JSON schemas used instead of regex-extracting JSON from free text.** This closes the exact failure class that caused this outage — malformed/missing JSON is now structurally impossible instead of merely unlikely. One schema quirk worth knowing: OpenAI's strict mode doesn't support free-form object keys (the original `WeekSchedule` type is `Record<date, Record<subject, DayLesson>>`), so the wire format for `parseLessonPlan` is an array of `{date, subjects: [{subject, lesson}]}` that gets reassembled into the original `WeekSchedule` shape after parsing. This is invisible outside `src/lib/ai.ts` — the exported type and every consumer are unchanged.
- **Secret handling:** `OPENAI_API_KEY` is stored only as a Supabase Edge Function secret on the `Pulse-academic` project, never in any frontend env var. Greg created and set a **dedicated Pulse Academic OpenAI key**, separate from the ShortHand key (he tried the ShortHand key first, then swapped to a Pulse-Academic-specific one for cleaner cost tracking). Claude never saw or handled the key value at any point.
- **Rollback path intentionally kept:** the old `groq-proxy` edge function and `GROQ_API_KEY` secret are both still deployed/set, untouched. Do not remove them yet — see "Remaining known issues."

**IMPORTANT — uncommitted at end of session:** This migration (`src/lib/ai.ts` new, `src/lib/groq.ts` deleted, `supabase/functions/openai-proxy/` new, import-path updates in `src/types.ts`, `src/App.tsx`, `src/components/PlanScreen.tsx`, `src/components/ReportsScreen.tsx`, `src/components/TrackerScreen.tsx`) was **verified working end-to-end but left as uncommitted working-tree changes** — `git status` at session end showed all of the above as modified/deleted/untracked, nothing staged or committed. The edge function itself IS deployed and live in Supabase regardless of local git state (Supabase deploys aren't git-driven here), so the app is functionally running on the new code, but the source changes are not yet in version control. **The next session should commit this before doing anything else**, so the working tree matches what's actually deployed and this work can't be accidentally lost or reverted by an unrelated `git` operation.

## 3. Verification results

- `npx tsc -b` and `npm run build` both clean after the migration.
- **23/23 focused automated checks passed** against the live deployed `openai-proxy`, covering all four AI functions with realistic inputs (a two-subject Monday, a messy/duplicated student-name paste, a real fractions lesson). All returned structurally valid JSON (schema-guaranteed, no regex), no LaTeX or markdown in any output field, `reasoning_tokens: 0` on every call.
- **Full production smoke test passed** (Playwright, real browser, real Supabase, real OpenAI calls): signup → auto-confirmed session → class + student setup → manual lesson start → tap-to-cycle all four statuses (got-it/almost/needs-help/absent) → exit ticket generation succeeded → Reports List and Groups views → mini-lesson/reteach generation succeeded. Every Supabase write during the run returned 200/201. Screenshots confirmed clean rendering, no LaTeX/garbage in either the exit-ticket panel or the mini-lesson panel.

## 4. Remaining known issues

- **Duplicate React key warning in `ReportsScreen.tsx`.** Investigated but root cause not confidently isolated — the colliding key patterns observed (one fixed id repeating against several different first ids) don't match a simple same-list duplicate in `dismissKey()`, which is otherwise well-formed. Cosmetic/console-only, did not corrupt or drop any data in either smoke test run. **Do not let this distract from relaunch work** unless a future session specifically chooses to dedicate time to it.
- **Old Groq path (`groq-proxy` function + `GROQ_API_KEY` secret) can be removed later**, once the OpenAI path has proven stable in real use for a few days. Not urgent, no risk in leaving it as-is.
- **The AI migration is uncommitted** — see section 2 above. Commit this first in the next session.

## 5. Test data in production

Two `pulse-smoketest-*@example.com` teacher accounts (with a class and 5 fake students each) were created during this session's and the prior session's Playwright smoke tests, against the real production database. They may still exist. Clean these up before real relaunch if they haven't been removed already.

## 6. Important product context (do not lose this framing)

**Pulse Academic is not primarily an exit-ticket generator.** The exit-ticket generator is one feature among several, not the core product. The intended core workflow:

1. Teacher uploads weekly lesson plans.
2. Teacher quickly marks each student's understanding during a lesson: got it / almost / needs help / absent.
3. Pulse Academic surfaces which students need reteaching or catch-up.
4. It groups students by shared needs (skill or lesson).
5. It can suggest a mini-reteach lesson for a group.
6. It can generate quick exit-ticket ideas tied to the lesson.
7. After reteaching, the teacher records whether the student got it now or still needs work, closing the loop.

**The product was paused because Greg's limited development time went to ShortHand, not because Pulse Academic was tested and found unwanted.** Do not treat the pause itself as evidence against the product.

## 7. Market/SEO context from recent research (OpenSEO/DataForSEO + GSC, prior session)

- Strongest acquisition wedge: exit ticket generator / exit ticket template.
- "Exit ticket template" shows roughly 1,300 US searches/month, low keyword difficulty.
- "Formative assessment app/software" has real commercial intent.
- "Reteaching," "check for understanding," and "small group planning" are useful supporting/Layer-2 topics, not primary traffic drivers.
- **Do not chase "mastery tracker" / "student mastery" as primary SEO targets** — Google treats that search territory as MasteryConnect/Instructure's, not winnable ground for a small entrant.
- Pulse Academic's existing marketing content already gets some impressions but too little traffic/click-through to fairly judge product demand one way or the other from SEO data alone.

## 8. Relaunch decision (read this before doing anything else)

**The app is technically safe to unpause.** That is now proven, not assumed. **However, Greg does not want to relaunch yet** — parts of the UX/product flow still feel fuzzy or confusing to him, independent of whether the code works. Technical completeness is not the same thing as product clarity, and this session's verification work should not be mistaken for a green light to relaunch.

**The next step is NOT marketing-site work.** The next step is a product clarity / usability audit of the actual app.

## 9. Next session task (read this, then start here)

The next Claude session should, in order:

1. Read this handoff in full, plus `CLAUDE.md` and `IMPLEMENTATION_PLAN.md` in this repo, before doing anything else.
2. Inspect the actual working app as a first-time teacher would experience it (real browser, real signup or demo mode — do not just read the source and assume).
3. Perform a product clarity/usability audit: identify confusing labels, flows, terminology, screens, or unnecessary complexity.
4. Specifically judge whether a teacher could understand the core loop (upload plan → mark understanding → get reteach groups → close the loop) without Greg explaining it first.
5. Separate every finding into three buckets: **must fix before relaunch**, **should improve soon**, **harmless polish**.
6. Propose the smallest set of changes needed before real teachers see the product. Do not implement anything until Greg approves the plan.

## 10. Guardrails — do not do these things in the next session

- Do not change the marketing site yet.
- Do not reopen signups yet.
- Do not remove the Groq rollback path (`groq-proxy` function, `GROQ_API_KEY` secret) yet.
- Do not start building new features.
- Do not build a public/free exit-ticket generator yet (it was evaluated as a plausible future acquisition tool, reusing the existing `suggestExitTickets` logic with a public-facing wrapper and its own rate-limiting, but that is deliberately not started).
- Do not treat technical completeness (this session's verification) as proof of product clarity (the next session's actual job).

---

## Prior session: April 30, 2026 — UI polish only

No product functionality, data flow, Supabase logic, or AI behavior was intentionally changed in that session.

1. Tracker/mobile polish — cleaned up header/nav, class/subject tabs, lesson picker cards, empty states. Commit `b4d6b86`.
2. Desktop roster density — wider roster screen, denser cards on large screens. Commit `4d95962`.
3. Mobile overflow fixes (two passes) — header/nav, reports filters, roster controls, history class selector. Commits `32a5aeb`, `32e0173`.

Files touched: `src/App.tsx`, `src/index.css`. Verified with `npm run build` + `npm run lint` after each pass. Committed and pushed directly to `origin/main`.

Known repo state at that time: an unrelated untracked file `public/creator.jpg` existed and was not modified.
