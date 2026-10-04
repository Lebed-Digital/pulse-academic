// Demo mode data: a synthetic teacher with two classes. Everything here stays in
// the browser. Demo mode never reads or writes Supabase.

import type { WeekSchedule } from './ai'
import { weekDates, type Check, type CheckResult, type ClassData, type Result } from './checks'

export type DemoClass = { id: string; name: string; subject: string; display_order: number }
export type DemoStudent = { id: string; name: string }
export type DemoStudentClass = { student_id: string; class_id: string }

const MATH = 'demo-class-am'
const ELA = 'demo-class-pm'

export const DEMO_CLASSES: DemoClass[] = [
  { id: MATH, name: 'Period 1', subject: 'Math', display_order: 0 },
  { id: ELA, name: 'Period 2', subject: 'ELA', display_order: 1 },
]

export const DEMO_STUDENTS: DemoStudent[] = [
  { id: 'ds-01', name: 'Ava Thompson' },
  { id: 'ds-02', name: 'Ava Torres' },
  { id: 'ds-03', name: 'Carter Hayes' },
  { id: 'ds-04', name: 'Charlotte Mendez' },
  { id: 'ds-05', name: 'Ella Chen' },
  { id: 'ds-06', name: 'Ella Park' },
  { id: 'ds-07', name: 'Grayson Reed' },
  { id: 'ds-08', name: 'Isabella Garcia' },
  { id: 'ds-09', name: 'Jaron King' },
  { id: 'ds-10', name: 'Lily Santos' },
  { id: 'ds-11', name: 'Logan Diaz' },
  { id: 'ds-12', name: 'Olivia Adams' },
  { id: 'ds-13', name: 'Riley Morgan' },
  { id: 'ds-14', name: 'Sloan Rivera' },
  { id: 'ds-15', name: 'Maximiliano Fernandez-Ortiz' },
  { id: 'ds-16', name: 'Bartholomew Washington' },
  { id: 'ds-17', name: 'Noah Kim' },
  { id: 'ds-18', name: 'Mia Nguyen' },
  { id: 'ds-19', name: 'Ethan Brooks' },
  { id: 'ds-20', name: 'Zoe Patel' },
  { id: 'ds-21', name: 'Lucas Ortiz' },
  { id: 'ds-22', name: 'Amara Okafor' },
  { id: 'ds-23', name: 'Henry Walsh' },
  { id: 'ds-24', name: 'Sofia Rossi' },
  { id: 'ds-25', name: 'Jack Miller' },
  // Period 2 only
  { id: 'ds-26', name: 'Emmett Vance' },
  { id: 'ds-27', name: 'Julia Novak' },
  { id: 'ds-28', name: 'Luca Lombardi' },
  { id: 'ds-29', name: 'Reagan Scott' },
]

const MATH_IDS = DEMO_STUDENTS.slice(0, 25).map(s => s.id)
const ELA_IDS = ['ds-01', 'ds-05', 'ds-08', 'ds-11', 'ds-12', 'ds-26', 'ds-27', 'ds-28', 'ds-29']

export const DEMO_STUDENT_CLASSES: DemoStudentClass[] = [
  ...MATH_IDS.map(sid => ({ student_id: sid, class_id: MATH })),
  ...ELA_IDS.map(sid => ({ student_id: sid, class_id: ELA })),
]

const MATH_FOCUS = [
  'Adding fractions with like denominators',
  'Adding fractions with unlike denominators',
  'Subtracting fractions with unlike denominators',
  'Adding mixed numbers with regrouping',
  'Subtracting mixed numbers with regrouping',
]

const ELA_FOCUS = [
  'Finding the main idea in nonfiction',
  'Telling supporting details from the main idea',
  "Identifying the author's purpose",
  'Recognizing cause and effect in a text',
  'Using signal words to compare and contrast',
]

// The demo always has a focus for today, weekends included, so the plan-fed
// focus is visible whenever someone opens it.
export function demoWeekSchedule(weekStart: string, today: string): WeekSchedule {
  const schedule: WeekSchedule = {}
  const dates = weekDates(weekStart)
  if (!dates.includes(today)) dates.push(today)
  dates.forEach((date, i) => {
    schedule[date] = {
      Math: { title: `Lesson ${12 + i}`, focus: MATH_FOCUS[i % MATH_FOCUS.length] },
      ELA: { title: `Lesson ${7 + i}`, focus: ELA_FOCUS[i % ELA_FOCUS.length] },
    }
  })
  return schedule
}

function at(daysAgo: number, hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function rows(checkId: string, marks: [Result | null, string[]][], notes: Record<string, string> = {}): CheckResult[] {
  return marks.flatMap(([result, ids]) =>
    ids.map(id => ({ id: `${checkId}-${id}`, check_id: checkId, student_id: id, result, note: notes[id] ?? null })),
  )
}

function buildDemoClassData(classId: string): ClassData {
  if (classId === ELA) {
    const check: Check = {
      id: 'demo-check-4', class_id: ELA, focus: ELA_FOCUS[0], started_at: at(1, 13, 10), ended_at: at(1, 13, 30),
      root_check_id: null, participant_ids: ELA_IDS,
    }
    return {
      checks: [check],
      results: rows(check.id, [
        ['needs-help', ['ds-26']],
        ['almost', ['ds-27']],
        ['got-it', ['ds-01', 'ds-05', 'ds-08', 'ds-11', 'ds-12', 'ds-28']],
      ]),
    }
  }

  const original: Check = {
    id: 'demo-check-1', class_id: MATH, focus: MATH_FOCUS[1], started_at: at(2, 10, 15), ended_at: at(2, 10, 40),
    root_check_id: null, participant_ids: MATH_IDS,
  }
  const recheck: Check = {
    id: 'demo-check-2', class_id: MATH, focus: MATH_FOCUS[1], started_at: at(1, 9, 50), ended_at: at(1, 10, 5),
    root_check_id: original.id, participant_ids: ['ds-03', 'ds-05', 'ds-07', 'ds-11', 'ds-17', 'ds-20'],
  }
  const open: Check = {
    id: 'demo-check-3', class_id: MATH, focus: MATH_FOCUS[2], started_at: new Date(Date.now() - 20 * 60_000).toISOString(), ended_at: null,
    root_check_id: null, participant_ids: MATH_IDS,
  }

  const flagged = ['ds-03', 'ds-07', 'ds-17', 'ds-05', 'ds-11', 'ds-20', 'ds-13', 'ds-22', 'ds-25']
  return {
    checks: [original, recheck, open],
    results: [
      ...rows(original.id, [
        ['needs-help', ['ds-03', 'ds-07', 'ds-17']],
        ['almost', ['ds-05', 'ds-11', 'ds-20']],
        ['absent', ['ds-13']],
        ['got-it', MATH_IDS.filter(id => !flagged.includes(id))],
      ], { 'ds-03': 'Adds the denominators together.' }),
      ...rows(recheck.id, [
        ['got-it', ['ds-03', 'ds-05']],
        ['needs-help', ['ds-07']],
        ['absent', ['ds-11']],
        ['almost', ['ds-17']],
      ], { 'ds-07': 'Still unsure how to find a common denominator.' }),
      ...rows(open.id, [
        ['got-it', ['ds-01', 'ds-02', 'ds-04', 'ds-06', 'ds-08', 'ds-09', 'ds-10', 'ds-12']],
        ['needs-help', ['ds-03']],
      ]),
    ],
  }
}

const store = new Map<string, ClassData>()

export function getDemoClassData(classId: string): ClassData {
  let data = store.get(classId)
  if (!data) {
    data = buildDemoClassData(classId)
    store.set(classId, data)
  }
  return data
}

export function setDemoClassData(classId: string, data: ClassData) {
  store.set(classId, data)
}
