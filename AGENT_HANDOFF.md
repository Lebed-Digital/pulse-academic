# Pulse Academic Handoff

## Session: September 9, 2026 — Delete Class shipped, class-lifecycle gap CLOSED

Picked up Priority 1 from the September 7 rollup (audit class lifecycle before relaunch), found the one real gap, and shipped it. **PR #5 merged as `ef18f99` and deployed to production; Delete Class is live at `app.pulseacademic.com`.**

### What the audit found

Create class, rename class, switch active class, and add/remove students all already existed and were left alone. **Permanent class deletion did not exist anywhere in the app.** With a client-side cap of six classes and no delete path, a mistyped or finished class occupied a slot forever. Archive and restore also do not exist, and remain **unbuilt by choice** (see below).

### What shipped

- **Secondary "Delete class" action** at the bottom of each expanded roster card, deliberately low-emphasis so it does not compete with everyday roster actions.
- **Exact-name typed confirmation.** The teacher types the class name exactly before the red "Delete permanently" button enables. Empty, partial, and wrong-case input all leave it disabled; surrounding whitespace is tolerated; a blank class name can never confirm. The modal states that deletion is permanent and lists what is lost (lessons, check-ins and status history, reteach history and small-group data, skills/mastery), and states explicitly that students are not deleted.
- **Class-specific cascade.** One scoped `delete from classes where id = ...`; Postgres cascades to `student_classes`, `lessons`, `checkins` (via lessons), `skills`, and `skill_mastery` (via skills). Every one of those FKs was verified `ON DELETE CASCADE` by querying `pg_constraint.confdeltype` against the live schema. Reteach data is the `checkins.retaught_count` column, not a separate table, so it goes with the check-ins. **No migration was required.** The existing `owner` RLS policy on `classes` is `cmd: ALL` scoped to `auth.uid()`, so delete was already permitted and already owner-scoped.
- **Student rows intentionally preserved.** Students link to classes only through `student_classes`. A student in another class keeps that class and all its history; a student whose only class was deleted keeps their row as an unattached record. **Orphan rows are tolerated on purpose. No orphan cleanup was added, and none should be added casually** — the reasoning is that temporary orphans are cheaper than accidentally destroying student data.
- **`week_plans` deliberately untouched.** It carries a `class_id` column but **has no foreign key on it**, so it does not cascade and a naive "delete everything with this class_id" would have reached it. Both loaders in `App.tsx` query it by `user_id` + `week_start` only, never by `class_id` — plans are **user-level and shared across all classes**. Deleting by `class_id` there would have destroyed week planning for every class the teacher owns. This was the one real trap in the schema.
- **Active-class reassignment.** Deleting a non-active class leaves the selection alone. Deleting the active class moves the teacher to the first remaining class and clears lesson context (active lesson, statuses, lesson input, exit tickets, subject). **Deleting the last class clears the selection to `''` and returns the existing no-class empty state.** History and Reports filters pointing at the deleted class are repaired (History follows, Reports falls back to All classes). No stale class id is left anywhere.
- **6-class cap now frees correctly** after a deletion, with no page refresh required.

### Verification

- **17 tests passing.** Vitest was added as a devDependency with a `test` script; **the repo previously had no test infrastructure at all** (no runner, no test files, no script). Decision logic was extracted into a pure module (`src/lib/deleteClass.ts`) so it is testable without mounting the app. Coverage: non-active delete, active delete with others remaining, final class, cap freeing, exact-name confirmation (rejecting partial/empty/wrong-case/wrong-class), demo mode performing no destructive write, and Supabase failure keeping the class and surfacing an error.
- **Live-database verification, in a transaction that was rolled back.** Fixture: two classes, a student in **both**, a second student in **only** the doomed class, lessons in each, check-ins with non-zero `retaught_count`, a skill and a mastery row. Result: the class, its memberships, lessons, check-ins, skill and mastery all gone; the kept class kept all of its own data; **both students survived**, including the one whose only class was deleted. A follow-up query confirmed zero probe residue and untouched production data.
- **Real-UI verification** via Playwright with PostgREST intercepted (no production writes): confirmation gating at every input state, a forced 500 surfacing an error and keeping the class, instant removal with no refresh, kept-class students intact, active-class switch landing on a valid class, and the empty state with "+ Add class" available again after the last delete.
- `npx tsc -b` clean, `npm run build` clean, `npm run lint` **unchanged at the pre-existing 8-problem baseline**.
- **Production deployment `dpl_C4idkNfG7EAHMgtp2oK8i9AfGwcG` confirmed `READY`**, target production, built from `ef18f99` — checked via the Vercel MCP, not inferred from a green PR check.
- **Greg personally click-tested the preview** across the six highest-risk flows before merge, then explicitly authorized it. Squash-merged, branch deleted.

### Worth not repeating

The active-class reassignment initially called the existing `switchSubject()` helper. That helper is defined **below** the `atRiskStudentIds` and `todayFlaggedCount` memos, and calling it from a function above them broke React Compiler's memoization analysis, adding two `Compilation Skipped: Existing memoization could not be preserved` errors. Bisected to confirm it was the sole cause. Fixed by resetting lesson context inline, which is also more correct since there is no lesson to resume after a delete.

### Two things to know before touching this

- **Deletion is permanent with no undo.** A class deleted in September is gone in June. That is the accepted scope, not an oversight. Archive is the obvious follow-up if it ever becomes a real complaint.
- **The `isDemo` guard in `rosterDeleteClass` is unreachable dead code.** The Roster screen is gated behind `{!isDemo && ...}` in both nav locations, so a demo user cannot reach this UI. It was retained as defensive code. Do not test it in demo mode and conclude it is broken.

### Files touched

`src/lib/deleteClass.ts` (new), `src/lib/deleteClass.test.ts` (new), `src/App.tsx`, `src/components/RosterScreen.tsx`, `src/types.ts`, `package.json`, `package-lock.json`. No schema migration, no edge-function or AI changes, no auth changes, no marketing-site changes.

---

## Session: September 7, 2026 (END OF DAY ROLLUP) — superseded in part, see September 9 above

Consolidated status for everything completed on September 7, 2026. The entries below this one are the individual session logs and remain accurate; read them only if you need detail this summary does not give you.

**Bottom line: the app is technically working. Password recovery is fixed and verified in production. Signup/relaunch is still intentionally paused.**

### What changed today

**Infrastructure and AI**
- **Supabase project restored and verified healthy.** Project `zhkgdbjhcignpcspllso` ("Pulse-academic") had gone `INACTIVE` from disuse and was reactivated. All 8 tables intact, RLS verified owner-scoped on every table, no schema drift.
- **AI layer migrated from the retired Groq model to OpenAI** (commit `1bf14dd`). Groq had silently retired `llama-3.3-70b-versatile`, breaking every AI feature at once since all four share one code path. Root cause was a stale model string, not secrets or deployment.
- **New OpenAI edge-function path is live and verified.** `supabase/functions/openai-proxy/index.ts`, deployed and `ACTIVE`, reading `OPENAI_API_KEY` from edge-function secrets. Client layer is `src/lib/ai.ts` (replaced the deleted `src/lib/groq.ts`). Model `gpt-5.6-luna`, `reasoning_effort: "none"`, confirmed honored via `reasoning_tokens === 0` on every call.
- **All four AI functions smoke-tested successfully:** 23/23 focused automated checks passed against the live deployed proxy (exit tickets, mini-lesson suggestions, lesson-plan parsing, student-name parsing), all returning schema-valid JSON.

**Product / UX**
- **Product clarity and UX simplification work completed and merged** (`bf67bc7` and `98d8fa6`, merged as `6066428`, deployment `dpl_4dVX8KTmW8EAPspiFgZu5qD8AYzF`). Status vocabulary standardized, Reports Groups view defaulted when students are flagged, reteach affordances labeled, Plan power-tooling collapsed behind progressive disclosure.
- **Setup tab-switch state-loss bug fixed.** A session-refresh auth event bounced the teacher out of `'setup'`, unmounting the screen and wiping the form. Reproduced against pre-fix code with a real `refreshSession()` call, then confirmed fixed.
- **Class-name / subject setup copy clarified.** Added explicit "Class name" and "Subject" labels; the two were genuinely ambiguous before. No schema change, the columns were always separate.
- **Reports got Print / Save as PDF.** A `#pulse-print-area` marker plus one `@media print` rule in `index.css`. No library added.

**Email delivery**
- **Forgot-password email delivery fixed by configuring Resend as custom SMTP.** Before this, `/recover` returned 500 with `550 "This API key is not authorized to send emails from pulseacademic.com"`.
- **`pulseacademic.com` verified in Resend.** Sender is **Pulse Academic <noreply@pulseacademic.com>**.
- **SPF, DKIM, and DMARC confirmed passing**, read from real delivered-message headers: `dkim=pass` on both `pulseacademic.com` and `amazonses.com`, `spf=pass`, `dmarc=pass`. Return-Path correctly delegated to Resend's subdomain. Email authentication is NOT a problem and does not need re-investigating.

**Password recovery (the bulk of the day)**
- **Multiple client-side race bugs diagnosed and fixed across PRs #1, #2, #3.** All three are in production and all three are needed:
  - **PR #1** (`7e47629`) guarded `getSession()` from clobbering an in-progress `'recovery'` state.
  - **PR #2** (`719c7a1`) reads the recovery hash synchronously in the lazy initializer, because `PASSWORD_RECOVERY` fires before React subscribes and is lost.
  - **PR #3** (`f7ed6b9`, deployment `dpl_6CM5jZaPA1A5851wqGECdjjRUaPq`) is the one that actually fixed it: `onAuthStateChange` replays `INITIAL_SESSION` to every new subscriber with the recovery session already saved, and it reliably beats the `setTimeout(0)`-deferred `PASSWORD_RECOVERY`. The fallthrough mapped it to `'app'`, so the lazy initializer set `'recovery'` and `INITIAL_SESSION` overwrote it microseconds later. Guarding `'recovery'` in that fallthrough fixed it. PR #3 also signs the user out after a successful `updateUser`, since the recovery link is a full login.
- **Production password recovery manually verified working end to end by Greg.** Confirmed server-side in auth logs: `/recover` 200, `/verify` 303, `PUT /user` 200 at 22:54.
- **Reset emails now use a branded Pulse Academic template**, replacing the three-word default that looked like phishing.
- **PR #4 (`3a81ffa`, deployment `dpl_FN9hyhqyyandFKvZHcHXvoFUAQU2`) added the `/reset` interception flow.** Adds a minimal `vercel.json` rewrite, one `isResetPage` condition in `Root.tsx` (no router), and `detectSessionInUrl: false` scoped to `/reset` only.
- **`/reset` is live in production and does not consume the recovery token on page load.** Verified two independent ways: a real headless Chrome loading `/reset?token_hash=...` and waiting produced zero requests to the Supabase auth host, and the auth logs show no `/verify` entry for that probe. A control run on the root path (detection still enabled) DID fire `GET /user` on load, proving the probe would catch a regression.
- **Reset links now use `token_hash` on `app.pulseacademic.com`** instead of exposing the raw Supabase confirmation URL. This matters mechanically: `/verify` is what spends the single-use token and it used to run server-side during the redirect, before the browser loaded anything. The template now emits the token hash and the page calls `verifyOtp()` inside the submit handler.
- **Real production verification confirmed the new reset flow still works.** Auth logs at 23:11 show `/recover` 200 followed by `/verify` **200** (a `verifyOtp` POST from the new page), distinct from the 303 redirect pattern of the old flow.
- **Gmail's large red danger warning disappeared in the latest test email** (Greg's own observation on the delivered message; not independently re-verified here).
- **Scanner-consumption risk reduced** by moving token redemption behind explicit user interaction. Note this is a large reduction, not a guarantee: aggressive scanners that execute JavaScript could still trigger it.

### Intentionally deferred (do NOT treat as forgotten or as bugs)

- **DMARC intentionally left at `p=none`.** Moving to `p=quarantine` is a later decision.
- **PKCE intentionally deferred to a later task.** The implicit flow puts real credentials in the URL fragment and is the root cause of this whole bug class; Supabase treats it as legacy. It is cheap now that `/reset` exists. Clerk was considered and is NOT recommended: a large migration for problems Supabase-with-PKCE already solves for a single-role teacher app.
- **Groq rollback path still exists and was intentionally left in place** (`groq-proxy` edge function and `GROQ_API_KEY` secret). Do not remove yet.
- **Duplicate React key warning in `ReportsScreen.tsx`** remains open and nonblocking.
- **Possible smoke-test accounts may still remain in production** from the day's signup and recovery testing. Worth auditing before public relaunch.
- **Marketing / relaunch work is still not complete.** The marketing site (`pulse-academic-website`, separate repo) still has stale exit-ticket-heavy positioning. In-app copy was rebalanced; the site was not touched.
- **Signup/relaunch should still be considered PAUSED until explicitly resumed.** Do not reopen it as a side effect of any other work.

### Next session

> **⭐ UPDATE September 9, 2026 — Priority 1 below is CLOSED. Do not re-run that audit.** It was performed, the single real gap was permanent class deletion, and that shipped as PR #5 (merge commit `ef18f99`, production deployment `dpl_C4idkNfG7EAHMgtp2oK8i9AfGwcG`, state READY). **Delete Class is live at `app.pulseacademic.com`.** See the September 9 entry at the top of this file for the full record. The revised priority list is under "Remaining relaunch blockers" below.

~~1. **Audit class lifecycle and account-maintenance features before public relaunch.**~~ **DONE September 9, 2026.** Findings, so nobody re-derives them:

   | Operation | Status |
   |---|---|
   | create class | already existed (`rosterAddClass`) |
   | rename / edit class | already existed (`rosterRenameClass`) |
   | switch active class | already existed |
   | add / remove students | already existed (`rosterAddStudent` / `rosterRemoveStudent`) |
   | **permanently delete class** | **was missing, BUILT AND SHIPPED September 9** |
   | archive class | **not built, by choice** |
   | restore archived class | **not built, by choice** |

   - **Associated data on delete, verified against the live schema** (queried `pg_constraint.confdeltype`, not assumed): `student_classes`, `lessons`, `checkins` (via lessons), `skills`, and `skill_mastery` (via skills) all `ON DELETE CASCADE` from the class row. A single `delete from classes` is sufficient; **no migration was required.**
   - **Student rows are intentionally preserved.** Students link to classes only through `student_classes`, so a student in another class keeps that class and its history, and a student whose only class was deleted keeps their row. Orphan rows are tolerated on purpose; **no orphan cleanup exists and none should be added casually.**
   - **`week_plans` is deliberately untouched.** It carries a `class_id` column but **has no foreign key on it**, and the app loads plans by `user_id` + `week_start` only. Plans are **user-level and shared across all classes**; deleting by `class_id` there would destroy week planning for every class the teacher owns. Do not add a cascade there without re-reading how the Plan screen loads.
   - **Archive/restore are a FUTURE lifecycle feature, not leftover work from this fix.** Delete was chosen because it closes the 6-class-cap trap immediately with no schema change; archive needs a migration plus a filter pass across every query. Deletion is permanent with no undo, which is the accepted scope. Revisit archive only if teachers actually ask.

### Remaining relaunch blockers

Priorities, in order:

1. **Gmail "This message might be dangerous" warning on reset emails.** Not an auth failure (SPF/DKIM/DMARC all verified passing). Driven by a new sending domain with near-zero reputation, `p=none` DMARC, and thin template content. `/reset` (PR #4) already shipped and handled the raw-`supabase.co`-link half. Remaining levers: move DMARC to `p=quarantine`, fill out the email template.
2. **Duplicate React key warning in `ReportsScreen.tsx`.** Open, non-blocking, still never investigated.
3. **Stale marketing-site copy** in `pulse-academic-website` (separate repo). Still exit-ticket-heavy positioning; in-app copy was rebalanced September 7 but the site was never touched.
4. **PKCE migration, as its own larger task.** The implicit flow puts real credentials in the URL fragment and is the root cause of the whole recovery bug class; Supabase treats it as legacy. Cheap now that `/reset` exists. Clerk was considered and is NOT recommended: a large migration for problems Supabase-with-PKCE already solves for a single-role teacher app.

**Still true and carried forward:** signup/relaunch remains intentionally **PAUSED** until explicitly resumed. Do not reopen it as a side effect of any other work.

### Known identifiers

| Item | Value |
|---|---|
| Supabase project | `zhkgdbjhcignpcspllso` |
| Vercel project | `prj_PkMDvw81pt7S4yTkGff9zozedpDc` |
| PR #1 | `7e47629945d4391f873bc96773133c3a09d55cf3` |
| PR #2 | `719c7a1bca8ea50996d4da7d3b12222645bb6817` |
| PR #3 | `f7ed6b9b6c963f417ab1b500c3c1db226a06d009` / `dpl_6CM5jZaPA1A5851wqGECdjjRUaPq` |
| PR #4 | `3a81ffa5824b4c5f473c4c34e6ae2418baf73a14` / `dpl_FN9hyhqyyandFKvZHcHXvoFUAQU2` |
| PR #5 (Delete Class) | `ef18f99281ced9e4927c05e5967948183d151b75` / `dpl_C4idkNfG7EAHMgtp2oK8i9AfGwcG` |
| UX pass | `6066428d71ba64fd861c850abab22fcbb1608143` / `dpl_4dVX8KTmW8EAPspiFgZu5qD8AYzF` |
| AI migration | `1bf14ddc0d0e8f483793392e60522c804a2bbeba` |

---

## Session: September 7, 2026 (latest) — Password recovery audit, INITIAL_SESSION fix, CLOSED and verified in production

Full end-to-end audit of password recovery. **The recovery-state bug is closed**: fixed, merged, deployed, and manually verified working in production by Greg. Two follow-ups remain open and are NOT done (see below).

### The bug, and why two prior fixes missed it

PR #1 and PR #2 were both correct and both remain in place. Neither fixed the actual failure, because neither guarded the right caller.

`onAuthStateChange` replays `INITIAL_SESSION` to every newly registered subscriber (`GoTrueClient._emitInitialSession`). By the time it fires, `_saveSession()` has already persisted the session minted by the recovery link, so it arrives **with a valid session**, and `Root.tsx`'s fallthrough mapped it straight to `'app'`. It also reliably wins the race: `PASSWORD_RECOVERY` is deferred behind a `setTimeout(0)` inside `_initialize()`, while `INITIAL_SESSION` is gated only on an already-resolved `initializePromise`. So PR #2's lazy initializer set `'recovery'` and `INITIAL_SESSION` overwrote it microseconds later. The teacher landed inside the app, already signed in, never seeing "Set a new password".

Worth remembering: **the recovery link is a full login.** That is what made this bug silent rather than an error.

### What the audit ruled OUT (do not re-investigate these)

Verified against production auth logs, live DNS, and raw email headers:

- **Server side was always healthy.** `/recover` 200 → `/verify` 303 → `action: login, login_method: implicit` → `/user` 200. The link always worked.
- **SPF, DKIM, and DMARC all pass.** Headers show `dkim=pass` (both `pulseacademic.com` and `amazonses.com`), `spf=pass`, `dmarc=pass`. Return-Path is correctly delegated to Resend's subdomain. Authentication is NOT the problem.
- **Resend click tracking is disabled.** The href in the delivered email is the raw Supabase verify URL, unmodified. No link rewriting is occurring, so it is not breaking anything.
- **`redirectTo` is correct** (`https://app.pulseacademic.com`), and Supabase config is correct.
- **PR #2's synchronous hash read is sound.** `_initialize()` is async and the hash strip sits behind an awaited `_getUser()` network call, so the lazy initializer comfortably wins that particular race. Creating the client at module-import time does NOT strip the hash first.

### The fix (PR #3, merged)

- **`src/Root.tsx`** — guard `'recovery'` in the `onAuthStateChange` fallthrough, exactly as `'setup'` already is. Recovery no longer depends on auth event ordering at all.
- **`src/ResetPasswordScreen.tsx`** — `signOut()` after a successful `updateUser({ password })`, so the new password is actually exercised at login and an abandoned reset cannot leave a live authenticated session behind.
- **Copy/routing follow-through** — success card now reads "Go to sign in", and `onDone` routes to `'auth'` since the session is intentionally gone. The old `session ? 'app' : 'auth'` would have read a stale session after sign-out.

Squash-merged as **`f7ed6b9b6c963f417ab1b500c3c1db226a06d009`**, deployment **`dpl_6CM5jZaPA1A5851wqGECdjjRUaPq`**, `state: READY`, `target: production`. Confirmed `app.pulseacademic.com` serves that build by fetching the live bundle and finding both changes in it, not just by trusting deployment status. `tsc -b`, `npm run lint`, `npm run build` all clean; lint baseline unchanged at the same 8 pre-existing problems.

**Greg manually verified the full reset flow end to end in production. This bug is closed.**

### Still open (do NOT treat as done)

1. **Gmail shows a red "This message might be dangerous" warning on every reset email.** Not an auth failure (see ruled-out list). Driven by: a raw `supabase.co` credential link inside an email branded as a different company, a brand-new sending domain with near-zero reputation, `p=none` DMARC, and very thin email content. Planned fix is the `/reset` interception page, plus moving DMARC to `p=quarantine` and filling out the template.
2. **Email scanners are consuming one-time recovery links.** Confirmed in production logs, not hypothetical: at 22:12:10 a `/verify` returned `"One-time token not found" / 403 Email link is invalid or has expired`, immediately followed by a second `/verify` 303 in the same second. Same `/reset` page addresses this, since a scanner would then fetch a plain page instead of burning the token. Expect intermittent "link doesn't work" reports until this ships.
3. **PKCE migration** — recommended after `/reset`, and cheap once that route exists. The implicit flow puts real credentials in the URL fragment and is the root cause of this entire class of bug. Supabase treats it as legacy. Clerk was considered and is NOT recommended here: it is a large migration for a one-line bug, and Supabase with PKCE is the better fit for a single-role teacher app.

A written plan for `/reset` is prepared and awaiting Greg's approval. **Nothing else about auth behavior should change until that plan is approved.**

### Explicitly NOT changed this session

SMTP credentials, DNS records, Supabase auth settings, email templates, redirect URLs, PKCE flow type, and the `/reset` page itself were all left untouched by deliberate instruction. The only production change was the two-file PR #3 above.

**Supersedes the stale "Forgot Password email did not arrive" item in the session below** — email delivery via Resend now works; the failures were the client-side state bug plus the two open email items above.

---

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
