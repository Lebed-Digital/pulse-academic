# Pulse Academic Handoff

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
