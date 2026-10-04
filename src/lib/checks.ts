import type { WeekSchedule } from './ai'

export type Result = 'got-it' | 'almost' | 'needs-help' | 'absent'
export type Mark = Result | 'not-checked'

export type Check = {
  id: string
  class_id: string
  focus: string | null
  started_at: string
  ended_at: string | null
  root_check_id: string | null
  participant_ids: string[]
}

export type CheckResult = {
  id: string
  check_id: string
  student_id: string
  result: Result | null
  note: string | null
  student_name?: string
}

export type ClassData = { checks: Check[]; results: CheckResult[] }

export const MARK_LABEL: Record<Mark, string> = {
  'got-it': 'Got it',
  'almost': 'Check again',
  'needs-help': 'Needs help',
  'absent': 'Not here',
  'not-checked': 'Not checked',
}

export const MARK_TEXT: Record<Mark, string> = {
  'got-it': 'text-emerald-400',
  'almost': 'text-yellow-400',
  'needs-help': 'text-red-400',
  'absent': 'text-blue-400',
  'not-checked': 'text-[#8b8b9a]',
}

// ── Plan helpers ──────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function weekDates(weekStart: string): string[] {
  const [y, m, d] = weekStart.split('-').map(Number)
  return [0, 1, 2, 3, 4].map(offset => toISO(new Date(y, m - 1, d + offset)))
}

// Push-back stays inside the week: whatever was on the last day drops off
// instead of landing on a date no loader reads.
export function skipPlanDay(schedule: WeekSchedule, dates: string[], dateISO: string, pushBack: boolean): WeekSchedule {
  const next: WeekSchedule = { ...schedule }
  const index = dates.indexOf(dateISO)
  if (pushBack && index !== -1) {
    for (let i = dates.length - 1; i > index; i--) {
      const moved = next[dates[i - 1]]
      if (moved) next[dates[i]] = moved
      else delete next[dates[i]]
    }
  }
  delete next[dateISO]
  return next
}

export function defaultFocus(schedule: WeekSchedule | undefined, classSubject: string, today: string): string | null {
  const entry = schedule?.[today]?.[classSubject]
  return entry?.focus?.trim() || entry?.title?.trim() || null
}

// ── Checks ────────────────────────────────────────────────────────────────

export function formatCheckTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatCheckDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function checkLabel(check: Check): string {
  return check.focus?.trim() || `Check · ${formatCheckTime(check.started_at)}`
}

function byStart(a: Check, b: Check): number {
  return Date.parse(a.started_at) - Date.parse(b.started_at) || a.id.localeCompare(b.id)
}

export function newestFirst(checks: Check[]): Check[] {
  return [...checks].sort((a, b) => byStart(b, a))
}

export type Counts = { checked: number; notHere: number; notChecked: number }

export function summarize(check: Check, results: CheckResult[]): { marks: Record<string, Mark>; counts: Counts } {
  const byStudent = new Map<string, Result | null>()
  for (const r of results) if (r.check_id === check.id) byStudent.set(r.student_id, r.result)

  const marks: Record<string, Mark> = {}
  const counts: Counts = { checked: 0, notHere: 0, notChecked: 0 }
  for (const id of check.participant_ids) {
    const result = byStudent.get(id) ?? null
    marks[id] = result ?? 'not-checked'
    if (result === null) counts.notChecked++
    else if (result === 'absent') counts.notHere++
    else counts.checked++
  }
  return { marks, counts }
}

export function progressText(counts: Counts): string {
  const parts = [`${counts.checked} checked`]
  if (counts.notHere > 0) parts.push(`${counts.notHere} not here`)
  if (counts.notChecked > 0) parts.push(`${counts.notChecked} not checked`)
  return parts.join(' · ')
}

// Who "Mark remaining as Got it" may touch: participants with no row at all,
// and participants whose row has a note but no result.
export function remaining(check: Check, results: CheckResult[]): { noRowIds: string[]; noteOnlyIds: string[] } {
  const byStudent = new Map<string, CheckResult>()
  for (const r of results) if (r.check_id === check.id) byStudent.set(r.student_id, r)

  const noRowIds: string[] = []
  const noteOnlyIds: string[] = []
  for (const id of check.participant_ids) {
    const row = byStudent.get(id)
    if (!row) noRowIds.push(id)
    else if (row.result === null) noteOnlyIds.push(id)
  }
  return { noRowIds, noteOnlyIds }
}

export type SupportStudent = {
  studentId: string
  result: 'needs-help' | 'almost'
  notHereOn: string | null
}

export type SupportGroup = { root: Check; students: SupportStudent[] }

// A root check and its rechecks form one context. Within it, a student's latest
// understanding is their most recent Got it / Check again / Needs help. Not here
// and note-only rows never resolve anything.
export function supportFor(checks: Check[], results: CheckResult[]): SupportGroup[] {
  const byId = new Map(checks.map(c => [c.id, c]))
  const resultsByCheck = new Map<string, CheckResult[]>()
  for (const r of results) {
    const list = resultsByCheck.get(r.check_id)
    if (list) list.push(r)
    else resultsByCheck.set(r.check_id, [r])
  }

  const byRoot = new Map<string, Map<string, { result: Result; notHereOn: string | null }>>()
  for (const check of [...checks].sort(byStart)) {
    const rootId = check.root_check_id ?? check.id
    if (!byRoot.has(rootId)) byRoot.set(rootId, new Map())
    const students = byRoot.get(rootId)!
    for (const r of resultsByCheck.get(check.id) ?? []) {
      if (r.result === null) continue
      const current = students.get(r.student_id)
      if (r.result === 'absent') {
        if (current) current.notHereOn = check.started_at
      } else {
        students.set(r.student_id, { result: r.result, notHereOn: null })
      }
    }
  }

  const groups: SupportGroup[] = []
  for (const [rootId, students] of byRoot) {
    const root = byId.get(rootId)
    if (!root) continue
    const open: SupportStudent[] = []
    for (const [studentId, state] of students) {
      if (state.result === 'needs-help' || state.result === 'almost') {
        open.push({ studentId, result: state.result, notHereOn: state.notHereOn })
      }
    }
    if (open.length > 0) groups.push({ root, students: open })
  }
  return groups.sort((a, b) => byStart(b.root, a.root))
}

export type HistoryEntry = { check: Check; result: Result | null; note: string | null }

export function studentHistory(studentId: string, checks: Check[], results: CheckResult[]): HistoryEntry[] {
  const byId = new Map(checks.map(c => [c.id, c]))
  const entries: HistoryEntry[] = []
  for (const r of results) {
    const check = byId.get(r.check_id)
    if (r.student_id !== studentId || !check) continue
    if (r.result === null && !r.note) continue
    entries.push({ check, result: r.result, note: r.note })
  }
  return entries.sort((a, b) => byStart(b.check, a.check))
}
