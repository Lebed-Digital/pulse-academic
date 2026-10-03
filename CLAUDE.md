# Pulse Academic — CLAUDE.md

**Parent project:** c:\projects\pulse-academic
**Stack:** React 19 + TypeScript + Vite + Supabase + Tailwind CSS v4

## Project overview

Pulse Academic is a teacher-facing app for tracking student progress, managing lesson plans, and building progress reports. Core screens: Landing, Auth, Setup, Tracker, Roster, History, Reports, Plan.

## Inherited rules from global CLAUDE.md

- **Domain:** Always use `pulseacademic.com` for marketing.
- **Dark mode:** Never use Tailwind `dark:` variants. Toggle `.dark` on `<html>` via JavaScript. Use `.dark .classname { }` rules in CSS files instead.
- **Em dashes:** Never use em dashes (—) in user-facing content. Rewrite with commas, periods, or colons.
- **Security:** Never display/echo API keys, tokens, or secrets. Tell user where to find them instead.
- **Privacy:** Never run queries returning raw user content (notes, names, emails, etc.). Query counts, timestamps, IDs only.
- **Permissions:** Use `defaultMode: "bypassPermissions"`. Greg doesn't want permission prompts.
- **Deploy flow:** `git add`, `git commit`, `git push` — all in one chain when asked to commit and deploy.

## Tailwind CSS v4 specifics

- Tailwind v4 changed syntax: no `@apply`, use `@layer utilities { }` instead for custom utilities.
- Build uses `@tailwindcss/vite` plugin — check `vite.config.ts` if CSS build issues occur.
- Dark mode works via JavaScript toggle of `.dark` class on `<html>` root element.

## Supabase integration

- Client initialized in app setup (likely `src/App.tsx` or a context).
- Database schema and RLS policies live in production project.
- Run `npx supabase gen types typescript` if TypeScript types are out of sync with schema.
- Use the Supabase MCP tools (`get_project`, `list_tables`, `apply_migration`) for schema inspection and DDL.

## Code style

- No comments unless WHY is non-obvious (hidden constraints, workarounds, invariants).
- Prefer named identifiers over comments that describe WHAT.
- Delete unused code completely — no `// removed` markers or `_unused` vars.
- No backwards-compatibility hacks or feature flags for dead code paths.

## Testing

- For UI changes: start dev server with `npm run dev`, test in browser (golden path + edge cases).
- Type checking via `tsc -b` (already in build script).
- Before commit: run `npm run lint` and fix any eslint warnings.

## File structure

- `src/App.tsx` — main app wrapper, likely handles auth state + routing.
- `src/screens/*` — full-page components (Landing, Auth, Setup, Tracker, Roster, History, Reports, Plan).
- `src/components/*` — reusable components, sheets, modals.
- `src/main.tsx` — Vite entry point.

## Common tasks

**Adding a new screen:**
1. Create `src/screens/YourScreen.tsx`.
2. Wire into routing in `src/App.tsx`.
3. Keep it a single file unless it grows beyond ~500 lines.

**Styling:**
1. Use Tailwind classes inline.
2. For complex layouts, add custom utilities to `src/app.css` (or similar) with `@layer utilities`.
3. Dark mode: if you need dark-specific styles, add to CSS file as `.dark .your-class { }`.

**Supabase data fetching:**
1. Fetch in `useEffect` or component mount.
2. Show loading state while fetching.
3. Handle errors gracefully (toast or inline message).

## Codex Review Policy

`/codex-review` (`.claude/skills/codex-review/SKILL.md`) gets a read-only second opinion from Codex (`gpt-6.1-sol`, `-s read-only`). Codex reviews, Claude is the only editor and decides every finding (ACCEPT / PARTIALLY ACCEPT / REJECT). Two Codex passes maximum per review. It never commits, pushes, deploys, or touches Supabase.

- **Plan first for non-trivial work.** When Greg asks for a plan or "the Codex review loop", or the work is risky (below): write the plan to `plans/<slug>.md`, run `/codex-review plan plans/<slug>.md`, and implement only after the plan survives. An open BLOCKER or unresolved disagreement after pass 2 goes to Greg, not into code.
- **Diff review before commit** for risky changes, after lint/test/build pass: `/codex-review`. Risky means Supabase reads or writes (especially upserts), anything touching historical assessment data, migrations/RLS/grants, deletion paths, auth, `supabase/functions/*`, AI calls and lesson-plan upload, demo mode (`isDemo`), or any redesign work. When unsure, treat it as risky.
- **Skip** for copy, styling, docs, comments, `plans/`, `.claude/` files, and obvious one-liners. Greg can ask for either mode on anything.
- Review artifacts go in `.codex-review/` (gitignored). Never commit them.

## Current redesign direction

Context: `Brain/Pulse Academic Simplification Audit.md` and `Brain/Pulse Academic Core Redesign Plan.md`. These later decisions win where they conflict with those docs:

- Class grid + student quick sheet remains the leading interaction.
- Untouched students stay neutral/unmarked, never automatically Got it. An optional, explicit "Mark remaining as Got it" action is fine.
- Weekly lesson-plan upload stays.
- AI extracts one daily learning focus, not multiple skills. If it can't confidently identify the focus, fall back to the lesson name/number (e.g. "Lesson 17"). The teacher can manually override today's focus. This supersedes the Core Redesign Plan's "no AI extraction in the new core".
- One overall result per student per check. Multi-skill fan-out leaves the new core.
- Notes remain secondary. A note never creates or changes a result.
- Rechecks create new dated evidence and preserve original results.
- The planner is reduced to supplying the daily focus, not removed wholesale.
- Existing historical data stays readable. No destructive migrations without Greg's explicit sign-off, and verify live schema before any migration work.

## Debugging cross-platform bugs

If a bug appears on iOS, Safari, PWA, or Android — or if the same fix has failed more than once:
1. Add debug toasts to observe all relevant runtime values.
2. Get one screenshot from the real device showing all values.
3. Fix based on evidence, not assumption.

## Session handoff

At the end of meaningful sessions, run `/ho` to save a summary to the Obsidian Brain. This creates a cross-agent safety net for handoff context.
