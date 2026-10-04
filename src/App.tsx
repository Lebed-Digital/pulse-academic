import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { parseStudentNames, type WeekSchedule } from './lib/ai'
import { isDeleteConfirmed, classesAfterDelete, nextSelectedClassId, canAddClass, studentsByClassAfterDelete } from './lib/deleteClass'
import { DEMO_CLASSES, DEMO_STUDENTS, DEMO_STUDENT_CLASSES, demoWeekSchedule } from './lib/demo'

import PlanScreen from './components/PlanScreen'
import Workspace from './components/Workspace'
import RosterScreen from './components/RosterScreen'

import type { Screen, NameFormat, AppClass, AppStudent } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────

const SUBJECTS = ['Math', 'ELA', 'Science', 'Social Studies', 'Specials', 'Other']
const LAST_CLASS_KEY = 'pulse.lastClassId'

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayISO() {
  return toISO(new Date())
}

function getWeekStart(iso: string, weeksAhead = 0) {
  const [y, m, d] = iso.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  const diff = day === 0 ? -6 : 1 - day
  return toISO(new Date(y, m - 1, d + diff + weeksAhead * 7))
}

function readLastClassId(): string | null {
  try {
    return localStorage.getItem(LAST_CLASS_KEY)
  } catch {
    return null
  }
}

function demoRoster(): Record<string, AppStudent[]> {
  const byClass: Record<string, AppStudent[]> = {}
  for (const cls of DEMO_CLASSES) {
    const ids = DEMO_STUDENT_CLASSES.filter(sc => sc.class_id === cls.id).map(sc => sc.student_id)
    byClass[cls.id] = DEMO_STUDENTS.filter(s => ids.includes(s.id))
  }
  return byClass
}

// ── Props ─────────────────────────────────────────────────────────────────

type Props = {
  userId: string
  isDemo?: boolean
  onSignOut: () => void
  onNeedsSetup?: () => void
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App({ userId, isDemo = false, onSignOut, onNeedsSetup }: Props) {
  const today = todayISO()
  const weekStart = getWeekStart(today)
  const nextWeekStart = getWeekStart(today, 1)

  // ── Data ──
  const [classes, setClasses] = useState<AppClass[]>(() => (isDemo ? DEMO_CLASSES.map(c => ({ ...c })) : []))
  const [studentsByClass, setStudentsByClass] = useState<Record<string, AppStudent[]>>(() => (isDemo ? demoRoster() : {}))
  const [currentSchedule, setCurrentSchedule] = useState<WeekSchedule | undefined>(() => (isDemo ? demoWeekSchedule(weekStart, today) : undefined))
  const [dataLoading, setDataLoading] = useState(!isDemo)

  // ── UI state ──
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [screen, setScreen] = useState<Screen>('tracker')
  const [selectedClassId, setSelectedClassId] = useState<string>(() => (isDemo ? DEMO_CLASSES[0].id : ''))

  function selectClass(id: string) {
    setSelectedClassId(id)
    try {
      localStorage.setItem(LAST_CLASS_KEY, id)
    } catch {
      // Storage can be unavailable (private mode). The class still switches.
    }
  }

  // Roster management
  const [rosterNewStudentName, setRosterNewStudentName] = useState<Record<string, string>>({})
  const [rosterRenaming, setRosterRenaming] = useState<string | null>(null)
  const [rosterRenameValue, setRosterRenameValue] = useState('')
  const [rosterConfirmRemove, setRosterConfirmRemove] = useState<{ studentId: string; classId: string } | null>(null)
  const [rosterRenamingStudent, setRosterRenamingStudent] = useState<string | null>(null)
  const [rosterStudentRenameValue, setRosterStudentRenameValue] = useState('')
  const [rosterAddingClass, setRosterAddingClass] = useState(false)
  const [rosterDeletingClass, setRosterDeletingClass] = useState<string | null>(null)
  const [rosterDeleteConfirmText, setRosterDeleteConfirmText] = useState('')
  const [rosterDeleteError, setRosterDeleteError] = useState('')
  const [rosterNewClassName, setRosterNewClassName] = useState('')
  const [rosterNewClassSubject, setRosterNewClassSubject] = useState('Math')
  const [rosterSaving, setRosterSaving] = useState(false)
  const [rosterPasteClassId, setRosterPasteClassId] = useState<string | null>(null)
  const [rosterPasteText, setRosterPasteText] = useState('')
  const [rosterParsing, setRosterParsing] = useState(false)
  const [rosterCopySourceClassId, setRosterCopySourceClassId] = useState<string | null>(null)
  const [rosterCopyTargetClassId, setRosterCopyTargetClassId] = useState<string>('')
  const [expandedRosterClassId, setExpandedRosterClassId] = useState<string | null>(null)

  async function rosterCopyFromClass() {
    if (!rosterCopySourceClassId || !rosterCopyTargetClassId) return
    setRosterSaving(true)
    const sourceStudents = studentsByClass[rosterCopySourceClassId] ?? []
    const targetStudents = studentsByClass[rosterCopyTargetClassId] ?? []
    const targetIds = new Set(targetStudents.map(s => s.id))
    for (const student of sourceStudents) {
      if (targetIds.has(student.id)) continue
      const { error } = await supabase.from('student_classes').insert({ student_id: student.id, class_id: rosterCopyTargetClassId })
      if (!error) setStudentsByClass(cur => ({ ...cur, [rosterCopyTargetClassId!]: [...(cur[rosterCopyTargetClassId!] ?? []), student] }))
      else console.error('copy roster insert error:', error)
    }
    // Re-fetch target class students to confirm what actually saved
    const { data: scRows } = await supabase
      .from('student_classes')
      .select('students(id, name)')
      .eq('class_id', rosterCopyTargetClassId)
    if (scRows) {
      const refreshed = scRows.map(r => r.students as unknown as AppStudent).filter(Boolean)
      setStudentsByClass(cur => ({ ...cur, [rosterCopyTargetClassId!]: refreshed }))
    }
    setRosterCopySourceClassId(null)
    setRosterCopyTargetClassId('')
    setRosterSaving(false)
  }

  async function rosterBulkAdd(classId: string) {
    if (!rosterPasteText.trim() || rosterParsing) return
    setRosterParsing(true)
    try {
      const names = await parseStudentNames(rosterPasteText)
      for (const name of names) {
        if (!name.trim()) continue
        const { data: student } = await supabase
          .from('students')
          .insert({ user_id: userId, name: name.trim() })
          .select('id, name')
          .single()
        if (student) {
          await supabase.from('student_classes').insert({ student_id: student.id, class_id: classId })
          setStudentsByClass(cur => ({ ...cur, [classId]: [...(cur[classId] ?? []), student] }))
        }
      }
      setRosterPasteClassId(null)
      setRosterPasteText('')
    } catch (e) {
      console.error(e)
    }
    setRosterParsing(false)
  }

  async function rosterAddStudent(classId: string) {
    const name = (rosterNewStudentName[classId] ?? '').trim()
    if (!name || rosterSaving) return
    setRosterSaving(true)
    // Insert student scoped to this teacher
    const { data: student } = await supabase
      .from('students')
      .insert({ user_id: userId, name })
      .select('id, name')
      .single()
    if (student) {
      await supabase.from('student_classes').insert({ student_id: student.id, class_id: classId })
      setStudentsByClass(cur => ({ ...cur, [classId]: [...(cur[classId] ?? []), student] }))
      setRosterNewStudentName(cur => ({ ...cur, [classId]: '' }))
    }
    setRosterSaving(false)
  }

  async function rosterRemoveStudent(studentId: string, classId: string) {
    setRosterSaving(true)
    await supabase.from('student_classes').delete().eq('student_id', studentId).eq('class_id', classId)
    setStudentsByClass(cur => ({ ...cur, [classId]: (cur[classId] ?? []).filter(s => s.id !== studentId) }))
    setRosterConfirmRemove(null)
    setRosterSaving(false)
  }

  async function rosterRenameStudent(studentId: string) {
    const name = rosterStudentRenameValue.trim()
    if (!name) return
    setRosterSaving(true)
    await supabase.from('students').update({ name }).eq('id', studentId)
    // Update the student name in every class they belong to
    setStudentsByClass(cur => {
      const next = { ...cur }
      for (const classId of Object.keys(next)) {
        next[classId] = next[classId].map(s => s.id === studentId ? { ...s, name } : s)
      }
      return next
    })
    setRosterRenamingStudent(null)
    setRosterStudentRenameValue('')
    setRosterSaving(false)
  }

  async function rosterRenameClass(classId: string) {
    const name = rosterRenameValue.trim()
    if (!name) return
    setRosterSaving(true)
    await supabase.from('classes').update({ name }).eq('id', classId)
    setClasses(cur => cur.map(c => c.id === classId ? { ...c, name } : c))
    setRosterRenaming(null)
    setRosterRenameValue('')
    setRosterSaving(false)
  }

  function rosterCancelDeleteClass() {
    setRosterDeletingClass(null)
    setRosterDeleteConfirmText('')
    setRosterDeleteError('')
  }

  async function rosterDeleteClass(classId: string) {
    const cls = classes.find(c => c.id === classId)
    if (!cls || !isDeleteConfirmed(rosterDeleteConfirmText, cls.name)) return

    setRosterSaving(true)
    setRosterDeleteError('')

    // Postgres cascades to student_classes, checks and check_results, plus the
    // legacy lessons, checkins, skills and skill_mastery tables. Students are
    // intentionally left in place.
    if (!isDemo) {
      const { error } = await supabase.from('classes').delete().eq('id', classId)
      if (error) {
        setRosterDeleteError('Could not delete the class. Check your connection and try again.')
        setRosterSaving(false)
        return
      }
    }

    setSelectedClassId(nextSelectedClassId(classes, classId, selectedClassId))
    setClasses(cur => classesAfterDelete(cur, classId))
    setStudentsByClass(cur => studentsByClassAfterDelete(cur, classId))
    rosterCancelDeleteClass()
    setRosterSaving(false)
  }

  async function rosterAddClass() {
    const name = rosterNewClassName.trim()
    if (!name || !canAddClass(classes)) return
    setRosterSaving(true)
    const display_order = classes.length
    const { data: cls } = await supabase
      .from('classes')
      .insert({ user_id: userId, name, subject: rosterNewClassSubject, display_order })
      .select('id, name, subject, display_order')
      .single()
    if (cls) {
      setClasses(cur => [...cur, cls])
      setStudentsByClass(cur => ({ ...cur, [cls.id]: [] }))
      if (!selectedClassId) setSelectedClassId(cls.id)
    }
    setRosterNewClassName('')
    setRosterNewClassSubject('Math')
    setRosterAddingClass(false)
    setRosterSaving(false)
  }

  // Name format
  const [nameFormat, setNameFormat] = useState<NameFormat>(() =>
    (localStorage.getItem('nameFormat') as NameFormat) ?? 'first'
  )
  function cycleNameFormat() {
    const next: NameFormat = nameFormat === 'full' ? 'first' : nameFormat === 'first' ? 'initials' : 'full'
    setNameFormat(next)
    localStorage.setItem('nameFormat', next)
  }

  // ── Load classes, students and this week's plan ──────────────────────────

  useEffect(() => {
    if (isDemo) return
    let cancelled = false

    async function load() {
      const { data: cls } = await supabase
        .from('classes')
        .select('id, name, subject, display_order')
        .eq('user_id', userId)
        .order('display_order')
      if (cancelled) return

      const loaded = cls ?? []

      if (loaded.length === 0) {
        setDataLoading(false)
        onNeedsSetup?.()
        return
      }

      const [{ data: scRows }, { data: wpData }] = await Promise.all([
        supabase
          .from('student_classes')
          .select('class_id, students(id, name)')
          .in('class_id', loaded.map(c => c.id)),
        supabase
          .from('week_plans')
          .select('plan_json')
          .eq('user_id', userId)
          .eq('week_start', weekStart)
          .maybeSingle(),
      ])
      if (cancelled) return

      const byClass: Record<string, AppStudent[]> = {}
      for (const cls of loaded) byClass[cls.id] = []
      for (const row of scRows ?? []) {
        const s = row.students as unknown as AppStudent
        if (s && byClass[row.class_id]) byClass[row.class_id].push(s)
      }

      const remembered = readLastClassId()
      setClasses(loaded)
      setSelectedClassId(loaded.find(c => c.id === remembered)?.id ?? loaded[0].id)
      setStudentsByClass(byClass)
      setCurrentSchedule((wpData?.plan_json as WeekSchedule | undefined) ?? undefined)
      setDataLoading(false)
    }
    load()
    return () => { cancelled = true }
    // onNeedsSetup is a new closure on every Root render. Depending on it would
    // reload everything each time Supabase re-validates the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isDemo, weekStart])

  // ── Derived data ──────────────────────────────────────────────────────────

  const duplicateNames = new Set(
    classes.map(c => c.name).filter((n, _, arr) => arr.filter(x => x === n).length > 1)
  )
  function classLabel(cls: AppClass) {
    return duplicateNames.has(cls.name) ? `${cls.subject} · ${cls.name}` : cls.name
  }

  const selectedClass = classes.find(c => c.id === selectedClassId) ?? null
  const classSubjects = [...new Set(classes.map(c => c.subject).filter(Boolean))]

  // ── Render ────────────────────────────────────────────────────────────────

  if (dataLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: '#0d0d0f' }}>
        <svg className="animate-spin h-8 w-8 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        <p className="text-sm" style={{ color: '#8b8b9a' }}>Loading…</p>
      </div>
    )
  }

  const rosterProps = {
    classes, studentsByClass, SUBJECTS, nameFormat, cycleNameFormat,
    rosterAddingClass, setRosterAddingClass, rosterNewClassName, setRosterNewClassName, rosterAddClass, rosterNewClassSubject, setRosterNewClassSubject,
    rosterDeletingClass, setRosterDeletingClass, rosterDeleteConfirmText, setRosterDeleteConfirmText, rosterDeleteError, rosterDeleteClass, rosterCancelDeleteClass,
    rosterSaving, rosterRenaming, rosterRenameValue, setRosterRenameValue, rosterRenameClass, setRosterRenaming,
    rosterConfirmRemove, rosterRemoveStudent, setRosterConfirmRemove, rosterNewStudentName, setRosterNewStudentName, rosterAddStudent,
    rosterPasteClassId, setRosterPasteClassId, rosterPasteText, setRosterPasteText, rosterParsing, rosterBulkAdd,
    rosterCopySourceClassId, setRosterCopySourceClassId, rosterCopyTargetClassId, setRosterCopyTargetClassId, rosterCopyFromClass,
    rosterRenamingStudent, setRosterRenamingStudent, rosterStudentRenameValue, setRosterStudentRenameValue, rosterRenameStudent,
    expandedRosterClassId, setExpandedRosterClassId,
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden pb-20" style={{ background: '#0d0d0f' }}>
      {/* Header */}
      <header style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-4 py-4 sm:px-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold leading-none" style={{ color: '#f0f0f2' }}>Pulse</h1>
            {isDemo && <span className="text-xs font-semibold text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded-full">Demo</span>}
          </div>
          <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>Academic Tracker</p>
        </div>
        <div className="min-w-0">
          <div className="hidden flex-wrap items-center gap-2 pb-0.5 sm:flex sm:flex-nowrap sm:justify-end sm:overflow-x-auto sm:scrollbar-none">
            {!isDemo && (
              <button
                type="button"
                onClick={() => setScreen(screen === 'plan' ? 'tracker' : 'plan')}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${screen === 'plan' ? 'bg-teal-900/50 text-teal-400' : 'hover:bg-white/5'}`}
                style={screen !== 'plan' ? { color: '#8b8b9a' } : {}}
              >
                {screen === 'plan' ? 'Done' : 'Week Plan'}
              </button>
            )}
            {!isDemo && (
              <button
                type="button"
                onClick={() => setScreen(screen === 'roster' ? 'tracker' : 'roster')}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${screen === 'roster' ? 'bg-teal-900/50 text-teal-400' : 'hover:bg-white/5'}`}
                style={screen !== 'roster' ? { color: '#8b8b9a' } : {}}
              >
                {screen === 'roster' ? 'Done' : 'Roster'}
              </button>
            )}
            {confirmSignOut ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onSignOut}
                  className="rounded-xl px-3 py-2 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 transition-colors"
                  style={{ color: '#f87171' }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSignOut(false)}
                  className="rounded-xl px-3 py-2 text-xs font-semibold hover:bg-white/5 transition-colors"
                  style={{ color: '#5a5a6a' }}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={isDemo ? onSignOut : () => setConfirmSignOut(true)}
                className="rounded-xl px-3 py-2 text-xs font-semibold hover:bg-white/5 transition-colors"
                style={{ color: '#5a5a6a' }}
              >
                {isDemo ? 'Exit' : 'Sign out'}
              </button>
            )}
          </div>
        </div>
        </div>
        {/* Class tabs, wrapping rows */}
        {screen === 'tracker' && classes.length > 1 && (
          <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex flex-wrap gap-2">
              {classes.map(cls => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => selectClass(cls.id)}
                  className={`max-w-[12.5rem] truncate px-3 py-2 rounded-2xl text-xs sm:px-4 sm:text-sm font-semibold transition-all ${
                    selectedClassId === cls.id ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20' : 'hover:bg-white/5'
                  }`}
                  style={selectedClassId !== cls.id ? { background: 'rgba(255,255,255,0.06)', color: '#8b8b9a' } : {}}
                >
                  {classLabel(cls)}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {screen === 'plan' && !isDemo && (
        <PlanScreen
          userId={userId}
          classSubjects={classSubjects}
          weekStart={weekStart}
          nextWeekStart={nextWeekStart}
          today={today}
          onCurrentWeekSaved={setCurrentSchedule}
        />
      )}
      {screen === 'tracker' && (selectedClass ? (
        <Workspace
          key={selectedClass.id}
          userId={userId}
          isDemo={isDemo}
          cls={selectedClass}
          students={studentsByClass[selectedClass.id] ?? []}
          schedule={currentSchedule}
          today={today}
          nameFormat={nameFormat}
          onGoToPlan={() => setScreen('plan')}
          onGoToRoster={() => setScreen('roster')}
        />
      ) : (
        <main className="flex-1 px-4 py-10 text-center">
          <p className="text-sm font-semibold" style={{ color: '#8b8b9a' }}>No classes yet.</p>
          {!isDemo && (
            <button type="button" onClick={() => setScreen('roster')} className="mt-2 text-sm font-semibold text-teal-400 underline">Add a class in Roster</button>
          )}
        </main>
      ))}
      {screen === 'roster' && !isDemo && <RosterScreen {...rosterProps} />}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 backdrop-blur z-50" style={{ background: 'rgba(17,17,19,0.97)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-stretch h-16">
          {/* Tracker */}
          <button
            type="button"
            onClick={() => setScreen('tracker')}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors relative"
            style={{ color: screen === 'tracker' ? '#2dd4bf' : '#5a5a6a' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" strokeLinecap="round" />
            </svg>
            Tracker
            {screen === 'tracker' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-teal-400 rounded-full" />}
          </button>

          {/* Plan */}
          {!isDemo && (
            <button
              type="button"
              onClick={() => setScreen('plan')}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors relative"
              style={{ color: screen === 'plan' ? '#818cf8' : '#5a5a6a' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
              </svg>
              Plan
              {screen === 'plan' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: '#818cf8' }} />}
            </button>
          )}

          {/* Roster */}
          {!isDemo && (
            <button
              type="button"
              onClick={() => setScreen('roster')}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors relative"
              style={{ color: screen === 'roster' ? '#34d399' : '#5a5a6a' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
              </svg>
              Roster
              {screen === 'roster' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-400 rounded-full" />}
            </button>
          )}

          {/* Sign out, or Exit in the demo */}
          {isDemo ? (
            <button
              type="button"
              onClick={onSignOut}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors"
              style={{ color: '#5a5a6a' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Exit demo
            </button>
          ) : confirmSignOut ? (
            <span className="flex-1 flex items-center justify-center gap-1">
              <button
                type="button"
                onClick={onSignOut}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-rose-500/20 transition-colors"
                style={{ color: '#f87171' }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmSignOut(false)}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold hover:bg-white/5 transition-colors"
                style={{ color: '#5a5a6a' }}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmSignOut(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors"
              style={{ color: '#5a5a6a' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </button>
          )}
        </div>
      </nav>
    </div>
  )
}
