import { describe, expect, it } from 'vitest'
import {
  checkLabel, defaultFocus, progressText, remaining, skipPlanDay, studentHistory, summarize, supportFor, weekDates,
  type Check, type CheckResult, type Result,
} from './checks'
import { formatStudentName } from './names'

function check(id: string, startedAt: string, extra: Partial<Check> = {}): Check {
  return { id, class_id: 'c1', focus: 'Fractions', started_at: startedAt, ended_at: null, root_check_id: null, participant_ids: ['s1', 's2', 's3'], ...extra }
}

function row(checkId: string, studentId: string, result: Result | null, note: string | null = null): CheckResult {
  return { id: `${checkId}-${studentId}`, check_id: checkId, student_id: studentId, result, note }
}

const monday = check('mon', '2026-10-05T14:00:00Z')
const tuesday = check('tue', '2026-10-06T14:00:00Z', { root_check_id: 'mon', participant_ids: ['s1'] })

describe('supportFor', () => {
  it('lists a student who needs help', () => {
    const groups = supportFor([monday], [row('mon', 's1', 'needs-help'), row('mon', 's2', 'got-it')])
    expect(groups).toHaveLength(1)
    expect(groups[0].root.id).toBe('mon')
    expect(groups[0].students).toEqual([{ studentId: 's1', result: 'needs-help', notHereOn: null }])
  })

  it('resolves when a linked recheck records Got it', () => {
    const groups = supportFor([monday, tuesday], [row('mon', 's1', 'needs-help'), row('tue', 's1', 'got-it')])
    expect(groups).toEqual([])
  })

  it('stays unresolved when the recheck is Not here, and says so', () => {
    const groups = supportFor([monday, tuesday], [row('mon', 's1', 'needs-help'), row('tue', 's1', 'absent')])
    expect(groups[0].students).toEqual([{ studentId: 's1', result: 'needs-help', notHereOn: tuesday.started_at }])
  })

  it('stays unresolved when the recheck only has a note', () => {
    const groups = supportFor([monday, tuesday], [row('mon', 's1', 'almost'), row('tue', 's1', null, 'was pulled out')])
    expect(groups[0].students).toEqual([{ studentId: 's1', result: 'almost', notHereOn: null }])
  })

  it('moves a student from Needs help to Check again on a recheck', () => {
    const groups = supportFor([monday, tuesday], [row('mon', 's1', 'needs-help'), row('tue', 's1', 'almost')])
    expect(groups[0].students[0].result).toBe('almost')
  })

  it('keeps an unrelated check with the same focus text separate', () => {
    const other = check('other', '2026-10-06T15:00:00Z')
    const groups = supportFor([monday, other], [row('mon', 's1', 'needs-help'), row('other', 's1', 'got-it')])
    expect(groups.map(g => g.root.id)).toEqual(['mon'])
  })

  it('ignores a student whose only result is Not here', () => {
    expect(supportFor([monday], [row('mon', 's1', 'absent')])).toEqual([])
  })

  it('orders by start time, not by array order', () => {
    const groups = supportFor([tuesday, monday], [row('tue', 's1', 'got-it'), row('mon', 's1', 'needs-help')])
    expect(groups).toEqual([])
  })
})

describe('summarize and remaining', () => {
  const results = [row('mon', 's1', 'got-it'), row('mon', 's2', null, 'a note'), row('other', 's3', 'needs-help')]

  it('counts a note-only student as Not checked', () => {
    const { marks, counts } = summarize(monday, results)
    expect(marks).toEqual({ s1: 'got-it', s2: 'not-checked', s3: 'not-checked' })
    expect(counts).toEqual({ checked: 1, notHere: 0, notChecked: 2 })
  })

  it('counts Not here apart from checked', () => {
    const { counts } = summarize(monday, [row('mon', 's1', 'absent'), row('mon', 's2', 'almost')])
    expect(counts).toEqual({ checked: 1, notHere: 1, notChecked: 1 })
    expect(progressText(counts)).toBe('1 checked · 1 not here · 1 not checked')
  })

  it('splits remaining into no-row and note-only, and skips anyone already marked', () => {
    const marked = [row('mon', 's1', 'absent'), row('mon', 's2', null, 'a note')]
    expect(remaining(monday, marked)).toEqual({ noRowIds: ['s3'], noteOnlyIds: ['s2'] })
  })

  it('only considers participants', () => {
    expect(remaining(tuesday, [])).toEqual({ noRowIds: ['s1'], noteOnlyIds: [] })
  })
})

describe('studentHistory', () => {
  it('returns dated results newest first and skips empty rows', () => {
    const entries = studentHistory('s1', [monday, tuesday], [row('mon', 's1', 'needs-help'), row('tue', 's1', 'got-it'), row('mon', 's2', 'got-it')])
    expect(entries.map(e => [e.check.id, e.result])).toEqual([['tue', 'got-it'], ['mon', 'needs-help']])
    expect(studentHistory('s1', [monday], [row('mon', 's1', null, null)])).toEqual([])
  })
})

describe('focus and labels', () => {
  const schedule = {
    '2026-10-05': { Math: { title: 'Lesson 17', focus: 'Add fractions with unlike denominators' }, ELA: { title: 'Lesson 4', focus: '' } },
  }

  it('prefers the focus, then the lesson label, then nothing', () => {
    expect(defaultFocus(schedule, 'Math', '2026-10-05')).toBe('Add fractions with unlike denominators')
    expect(defaultFocus(schedule, 'ELA', '2026-10-05')).toBe('Lesson 4')
    expect(defaultFocus(schedule, 'Science', '2026-10-05')).toBeNull()
    expect(defaultFocus(schedule, 'Math', '2026-10-06')).toBeNull()
    expect(defaultFocus(undefined, 'Math', '2026-10-05')).toBeNull()
  })

  it('reads an old plan row that has a title and no focus', () => {
    const old = { '2026-10-05': { Math: { title: 'Fractions review', objective: 'x' } } } as unknown as typeof schedule
    expect(defaultFocus(old, 'Math', '2026-10-05')).toBe('Fractions review')
  })

  it('labels a check by its focus, or by its start time when it has none', () => {
    expect(checkLabel(monday)).toBe('Fractions')
    expect(checkLabel({ ...monday, focus: null })).toMatch(/^Check · /)
    expect(checkLabel({ ...monday, focus: '  ' })).toMatch(/^Check · /)
  })
})

describe('skipPlanDay', () => {
  const dates = weekDates('2026-10-05')
  const entry = (title: string) => ({ Math: { title, focus: '' } })
  const schedule = { [dates[0]]: entry('L1'), [dates[1]]: entry('L2'), [dates[3]]: entry('L4'), [dates[4]]: entry('L5') }

  it('builds Monday to Friday', () => {
    expect(dates).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'])
  })

  it('removes just that day', () => {
    const next = skipPlanDay(schedule, dates, dates[1], false)
    expect(Object.keys(next).sort()).toEqual([dates[0], dates[3], dates[4]])
  })

  it('pushes later days back inside the week and drops Friday', () => {
    const next = skipPlanDay(schedule, dates, dates[1], true)
    expect(next[dates[0]]).toEqual(entry('L1'))
    expect(next[dates[1]]).toBeUndefined()
    expect(next[dates[2]]).toEqual(entry('L2'))
    expect(next[dates[3]]).toBeUndefined()
    expect(next[dates[4]]).toEqual(entry('L4'))
    expect(Object.keys(next).every(d => dates.includes(d))).toBe(true)
  })

  it('does not change the original schedule', () => {
    skipPlanDay(schedule, dates, dates[0], true)
    expect(schedule[dates[0]]).toEqual(entry('L1'))
  })
})

describe('formatStudentName', () => {
  const names = ['Ava Thompson', 'Ava Torres', 'Ella Chen', 'Ella Park', 'Noah Kim']

  it('uses the first name when it is unique', () => {
    expect(formatStudentName('Noah Kim', 'first', names)).toBe('Noah')
  })

  it('adds the last initial when first names collide', () => {
    expect(formatStudentName('Ella Chen', 'first', names)).toBe('Ella C.')
    expect(formatStudentName('Ella Park', 'first', names)).toBe('Ella P.')
  })

  it('falls back to full names when first name and last initial both collide', () => {
    expect(formatStudentName('Ava Thompson', 'first', names)).toBe('Ava Thompson')
    expect(formatStudentName('Ava Torres', 'first', names)).toBe('Ava Torres')
  })
})
