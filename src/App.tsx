import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { parseLessonPlan, suggestExitTickets, parseStudentNames, type DayLesson, type WeekSchedule, type ExitTicket } from './lib/groq'
import { buildPullGroups } from './lib/groups'
import {
  DEMO_CLASSES, DEMO_STUDENTS, DEMO_STUDENT_CLASSES, DEMO_LESSONS, DEMO_CHECKINS,
  type DemoClass, type DemoStudent,
} from './lib/demo'

import PlanScreen from './components/PlanScreen'
import TrackerScreen from './components/TrackerScreen'
import HistoryScreen from './components/HistoryScreen'
import ReportsScreen from './components/ReportsScreen'
import RosterScreen from './components/RosterScreen'
import StudentProfileSheet from './components/StudentProfileSheet'
import MicButton from './components/MicButton'

import type { Status, Screen, HistoryTab, NameFormat, AppClass, AppStudent, AppLesson, HistoryRow, SavedPlan, ReportClass, ReportRange, ReportStudent } from './types'

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_CYCLE: Status[] = ['got-it', 'almost', 'needs-help', 'absent']

const STATUS_RING: Record<Status | 'unmarked', string> = {
  'unmarked':   '',
  'got-it':     'ring-[3px] ring-emerald-400',
  'almost':     'ring-[3px] ring-yellow-400',
  'needs-help': 'ring-[3px] ring-red-400',
  'absent':     'ring-[3px] ring-blue-400',
}

const STATUS_INITIAL_BG: Record<Status | 'unmarked', string> = {
  'unmarked':   'bg-[#1e1e22] text-[#8b8b9a] ring-1 ring-white/10',
  'got-it':     'bg-[#1a2a1e] text-white',
  'almost':     'bg-[#2a2310] text-white',
  'needs-help': 'bg-[#2a1a1a] text-white',
  'absent':     'bg-[#0f1a2a] text-white',
}

const STATUS_DOT: Record<Status, string> = {
  'got-it':     'bg-emerald-400',
  'almost':     'bg-yellow-400',
  'needs-help': 'bg-red-400',
  'absent':     'bg-blue-400',
}

const STATUS_CARD: Record<Status | 'unmarked', string> = {
  'unmarked':   'bg-[#141416] border border-white/10',
  'got-it':     'bg-[#111c14] border border-emerald-900/60',
  'almost':     'bg-[#1c1a0e] border border-yellow-900/60',
  'needs-help': 'bg-[#1c1010] border border-red-900/60',
  'absent':     'bg-[#0f1622] border border-blue-900/60',
}

const STATUS_LABEL: Record<Status, string> = {
  'got-it':     'Got It',
  'almost':     'Almost',
  'needs-help': 'Needs Help',
  'absent':     'Absent',
}

const STATUS_PILL: Record<Status, string> = {
  'got-it':     'bg-emerald-900/40 text-emerald-400',
  'almost':     'bg-yellow-900/40 text-yellow-400',
  'needs-help': 'bg-red-900/40 text-red-400',
  'absent':     'bg-blue-900/40 text-blue-400',
}

// ── Helpers ───────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekStart(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(y, m - 1, d + diff)
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
}

function formatStudentName(fullName: string, format: NameFormat, classmates: string[]): string {
  const parts = fullName.trim().split(/\s+/)
  const first = parts[0]
  const rest = parts.slice(1)
  const lastInitial = rest.length > 0 ? rest[rest.length - 1][0].toUpperCase() + '.' : ''
  if (format === 'full') return fullName
  if (format === 'initials') return parts.map(p => p[0].toUpperCase()).join('.') + '.'
  const dupFirst = classmates.filter(n => n.trim().split(/\s+/)[0] === first && n !== fullName)
  if (dupFirst.length === 0 || !lastInitial) return first
  const dupFirstAndLast = dupFirst.filter(n => {
    const p = n.trim().split(/\s+/)
    return p.length > 1 && p[p.length - 1][0].toUpperCase() + '.' === lastInitial
  })
  return dupFirstAndLast.length === 0 ? `${first} ${lastInitial}` : `${first} ${lastInitial} (2)`
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatWeek(weekStart: string) {
  const [y, m, d] = weekStart.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 4)
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function nextISOWeekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  if (next.getDay() === 6) next.setDate(next.getDate() + 2)
  if (next.getDay() === 0) next.setDate(next.getDate() + 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
    GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await getDocument({ data: arrayBuffer }).promise
    let text = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
    }
    return text
  }
  if (ext === 'docx' || ext === 'doc') {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  }
  return await file.text()
}

// ── Demo data adapters ────────────────────────────────────────────────────

function buildDemoHistory(): HistoryRow[] {
  const rows: HistoryRow[] = []
  const studentMap = Object.fromEntries(DEMO_STUDENTS.map((s: DemoStudent) => [s.id, s.name]))
  const classMap = Object.fromEntries(DEMO_CLASSES.map((c: DemoClass) => [c.id, c.name]))
  for (const checkin of DEMO_CHECKINS) {
    const lesson = DEMO_LESSONS.find(l => l.id === checkin.lesson_id)
    if (!lesson) continue
    rows.push({
      class_id: lesson.class_id,
      class_name: classMap[lesson.class_id] ?? '',
      student_id: checkin.student_id,
      student_name: studentMap[checkin.student_id] ?? '',
      lesson_id: lesson.id,
      lesson_title: lesson.title,
      date: lesson.date,
      status: checkin.status,
    })
  }
  return rows
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
  const nextWeekStart = (() => {
    const [y, m, d] = weekStart.split('-').map(Number)
    const dt = new Date(y, m - 1, d + 7)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  })()

  // ── Data ──
  const [classes, setClasses] = useState<AppClass[]>([])
  const [studentsByClass, setStudentsByClass] = useState<Record<string, AppStudent[]>>({})
  const [dataLoading, setDataLoading] = useState(true)

  // ── UI state ──
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [screen, setScreen] = useState<Screen>('tracker')
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [lessonInput, setLessonInput] = useState('')
  const [activeLesson, setActiveLesson] = useState<AppLesson | null>(null)
  const [studentStatuses, setStudentStatuses] = useState<Record<string, Status>>({})
  const [loading, setLoading] = useState(false)

  // Exit ticket
  const [exitTickets, setExitTickets] = useState<ExitTicket[]>([])
  const [exitTicketLoading, setExitTicketLoading] = useState(false)
  const [activeExitTicket, setActiveExitTicket] = useState<ExitTicket | null>(null)
  const [showExitTickets, setShowExitTickets] = useState(false)

  // Week plan
  const [planViewWeek, setPlanViewWeek] = useState<'current' | 'next'>('current')
  const activePlanWeekStart = planViewWeek === 'next' ? nextWeekStart : weekStart
  const [planText, setPlanText] = useState('')
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState('')
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null>(null)
  const [currentWeekPlan, setCurrentWeekPlan] = useState<SavedPlan | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<DayLesson | null>(null)
  const [swapSource, setSwapSource] = useState<string | null>(null)
  const [skipConfirmDay, setSkipConfirmDay] = useState<string | null>(null)
  const [swapSubjectSource, setSwapSubjectSource] = useState<{ dateISO: string; subject: string } | null>(null)
  const [skipConfirmSubject, setSkipConfirmSubject] = useState<{ dateISO: string; subject: string } | null>(null)
  const [planSaving, setPlanSaving] = useState(false)
  const [undoSnapshot, setUndoSnapshot] = useState<WeekSchedule | null>(null)
  const [planSaved, setPlanSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingSchedule, setPendingSchedule] = useState<WeekSchedule | null>(null)
  const [subjectChoices, setSubjectChoices] = useState<string[]>([])
  const [activeSubject, setActiveSubject] = useState<string | null>(null)

  // Subject mapping: plan subject name -> class subject name
  const [subjectMappings, setSubjectMappings] = useState<Record<string, string>>({})
  // Subjects from the scanned plan that don't match any class subject
  const [unmappedSubjects, setUnmappedSubjects] = useState<string[]>([])
  // Draft mappings the teacher is filling in before confirming
  const [pendingMappings, setPendingMappings] = useState<Record<string, string>>({})

  // Student profile sheet
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null)
  const [profileStudentName, setProfileStudentName] = useState<string>('')

  function openProfile(id: string, name: string) {
    setProfileStudentId(id)
    setProfileStudentName(name)
  }
  function closeProfile() { setProfileStudentId(null) }

  // History
  const [historyTab, setHistoryTab] = useState<HistoryTab>('student')
  const [historyClassId, setHistoryClassId] = useState<string>('')
  const [historyData, setHistoryData] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedLesson, setSelectedLesson] = useState<{ lesson_id: string; lesson_title: string; date: string } | null>(null)

  // Roster management
  const [rosterNewStudentName, setRosterNewStudentName] = useState<Record<string, string>>({})
  const [rosterRenaming, setRosterRenaming] = useState<string | null>(null)
  const [rosterRenameValue, setRosterRenameValue] = useState('')
  const [rosterConfirmRemove, setRosterConfirmRemove] = useState<{ studentId: string; classId: string } | null>(null)
  const [rosterRenamingStudent, setRosterRenamingStudent] = useState<string | null>(null)
  const [rosterStudentRenameValue, setRosterStudentRenameValue] = useState('')
  const [rosterAddingClass, setRosterAddingClass] = useState(false)
  const [rosterNewClassName, setRosterNewClassName] = useState('')
  const [rosterNewClassSubject, setRosterNewClassSubject] = useState('Math')
  const [rosterSaving, setRosterSaving] = useState(false)
  const [rosterPasteClassId, setRosterPasteClassId] = useState<string | null>(null)
  const [rosterPasteText, setRosterPasteText] = useState('')
  const [rosterParsing, setRosterParsing] = useState(false)
  const [rosterCopySourceClassId, setRosterCopySourceClassId] = useState<string | null>(null)
  const [rosterCopyTargetClassId, setRosterCopyTargetClassId] = useState<string>('')
  const [expandedRosterClassId, setExpandedRosterClassId] = useState<string | null>(null)

  const SUBJECTS = ['Math', 'ELA', 'Science', 'Social Studies', 'Specials', 'Other']

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

  async function rosterAddClass() {
    const name = rosterNewClassName.trim()
    if (!name || classes.length >= 6) return
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
    }
    setRosterNewClassName('')
    setRosterNewClassSubject('Math')
    setRosterAddingClass(false)
    setRosterSaving(false)
  }

  // Reports
  const [reportClassId, setReportClassId] = useState<string>('all')
  const [reportRange, setReportRange] = useState<ReportRange>('today')
  const [reportCustomStart, setReportCustomStart] = useState('')
  const [reportCustomEnd, setReportCustomEnd] = useState('')
  const [reportCopied, setReportCopied] = useState(false)
  const [reportView, setReportViewState] = useState<'list' | 'groups'>(
    () => localStorage.getItem('reportView') === 'groups' ? 'groups' : 'list'
  )
  function setReportView(view: 'list' | 'groups') {
    setReportViewState(view)
    localStorage.setItem('reportView', view)
  }

  function reportDateBounds(): { start: string; end: string } | null {
    const [y, m] = today.split('-').map(Number)
    if (reportRange === 'today') return { start: today, end: today }
    if (reportRange === 'week') return { start: weekStart, end: today }
    if (reportRange === 'month') {
      const start = `${y}-${String(m).padStart(2, '0')}-01`
      return { start, end: today }
    }
    if (reportRange === 'custom') {
      if (!reportCustomStart || !reportCustomEnd) return null
      return { start: reportCustomStart, end: reportCustomEnd }
    }
    return null // 'all'
  }


  const reportData: ReportClass[] = useMemo(() => {
    const bounds = reportDateBounds()
    const targetClasses = reportClassId === 'all' ? classes : classes.filter(c => c.id === reportClassId)

    return targetClasses.map(cls => {
      const students = studentsByClass[cls.id] ?? []
      const classRows = historyData.filter(r => {
        if (r.class_id !== cls.id) return false
        if (r.status === 'got-it') return false
        if (bounds && (r.date < bounds.start || r.date > bounds.end)) return false
        return true
      })

      // If a student has any 'absent' row for a lesson, suppress needs-help/almost rows
      // for that same lesson (orphaned skill rows from before absent was tapped).
      const absentKeys = new Set(
        classRows.filter(r => r.status === 'absent').map(r => `${r.student_id}|${r.lesson_id}`)
      )
      const deduped = classRows.filter(r =>
        r.status === 'absent' || !absentKeys.has(`${r.student_id}|${r.lesson_id}`)
      )

      const studentMap = new Map<string, ReportStudent>()
      for (const row of deduped) {
        if (!studentMap.has(row.student_id)) {
          const s = students.find(s => s.id === row.student_id)
          if (!s) continue
          studentMap.set(row.student_id, { id: row.student_id, name: row.student_name, lessons: [], notes: [] })
        }
        const student = studentMap.get(row.student_id)!
        student.lessons.push({ lessonId: row.lesson_id, title: row.lesson_title, date: row.date, status: row.status as 'needs-help' | 'almost' | 'absent', skill: row.skill ?? null })
        if (row.note?.trim()) student.notes.push({ date: row.date, lessonTitle: row.lesson_title, text: row.note.trim() })
      }

      const all: ReportStudent[] = [...studentMap.values()].map(s => ({
        ...s,
        lessons: s.lessons.sort((a, b) => b.date.localeCompare(a.date)),
        notes: s.notes.sort((a, b) => b.date.localeCompare(a.date)),
      }))

      const needsSupport = all.filter(s => s.lessons.some(l => l.status === 'needs-help')).sort((a, b) => a.name.localeCompare(b.name))
      const checkIn = all.filter(s => !s.lessons.some(l => l.status === 'needs-help') && s.lessons.some(l => l.status === 'almost')).sort((a, b) => a.name.localeCompare(b.name))
      const absent = all.filter(s => !s.lessons.some(l => l.status === 'needs-help') && !s.lessons.some(l => l.status === 'almost') && s.lessons.some(l => l.status === 'absent')).sort((a, b) => a.name.localeCompare(b.name))

      return { classId: cls.id, className: cls.name, needsSupport, checkIn, absent }
    }).filter(c => c.needsSupport.length > 0 || c.checkIn.length > 0 || c.absent.length > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyData, classes, studentsByClass, reportClassId, reportRange, reportCustomStart, reportCustomEnd, today])

  function reportRangeLabel(): string {
    const bounds = reportDateBounds()
    return reportRange === 'today' ? `Today (${formatDate(today)})`
      : reportRange === 'week' ? `This week (${formatWeek(weekStart)})`
      : reportRange === 'month' ? `This month`
      : reportRange === 'custom' && bounds ? `${formatDate(bounds.start)} – ${formatDate(bounds.end)}`
      : 'All time'
  }

  function buildReportText(): string {
    const lines: string[] = [`Student Support Report — ${reportRangeLabel()}`, '']
    for (const cls of reportData) {
      lines.push(`── ${cls.className} ──`)
      if (cls.needsSupport.length > 0) {
        lines.push('Needs Support:')
        for (const s of cls.needsSupport) {
          const topics = [...new Set(s.lessons.filter(l => l.status === 'needs-help').map(l => l.title))].join(', ')
          lines.push(`  • ${s.name} — ${topics}`)
          for (const n of s.notes.slice(0, 3)) {
            lines.push(`    - Note (${formatDate(n.date)} | ${n.lessonTitle}): ${n.text}`)
          }
        }
      }
      const struggledSkills = new Map<string, Set<string>>()
      for (const s of cls.needsSupport) {
        for (const lesson of s.lessons) {
          if (lesson.status !== 'needs-help') continue
          if (!lesson.skill?.trim()) continue
          const skill = lesson.skill.trim()
          if (!struggledSkills.has(skill)) struggledSkills.set(skill, new Set<string>())
          struggledSkills.get(skill)!.add(s.id)
        }
      }
      if (struggledSkills.size > 0) {
        lines.push('Struggled with:')
        for (const [skill, studentIds] of [...struggledSkills.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))) {
          lines.push(`  - ${skill}  ${studentIds.size} student${studentIds.size !== 1 ? 's' : ''}`)
        }
      }
      if (cls.checkIn.length > 0) {
        lines.push('Worth a Check-In:')
        for (const s of cls.checkIn) {
          const topics = [...new Set(s.lessons.map(l => l.title))].join(', ')
          lines.push(`  • ${s.name} — ${topics}`)
          for (const n of s.notes.slice(0, 3)) {
            lines.push(`    - Note (${formatDate(n.date)} | ${n.lessonTitle}): ${n.text}`)
          }
        }
      }
      if (cls.absent.length > 0) {
        lines.push('Missed Lesson (need catch-up):')
        for (const s of cls.absent) {
          const lessons = [...new Set(s.lessons.map(l => l.title))].join(', ')
          lines.push(`  • ${s.name} — ${lessons}`)
        }
      }
      lines.push('')
    }
    return lines.join('\n').trim()
  }

  function buildGroupsText(): string {
    const lines: string[] = [`Small Group Plan - ${reportRangeLabel()}`, '']
    const classGroups = buildPullGroups(reportData, showSkills)
    for (const cls of reportData) {
      lines.push(`── ${cls.className} ──`)
      const groups = classGroups.find(c => c.classId === cls.classId)?.groups ?? []
      groups.forEach((g, i) => {
        lines.push(`Group ${i + 1}: ${g.label} (${g.students.length} student${g.students.length !== 1 ? 's' : ''})`)
        for (const s of g.students) {
          lines.push(`  • ${s.name} (${s.status === 'needs-help' ? 'needs help' : 'almost'})`)
        }
      })
      if (cls.absent.length > 0) {
        if (groups.length > 0) lines.push('')
        lines.push('Catch-up (absent):')
        for (const s of cls.absent) {
          const lessons = [...new Set(s.lessons.filter(l => l.status === 'absent').map(l => l.title))].join(', ')
          lines.push(`  • ${s.name} - ${lessons}`)
        }
      }
      lines.push('')
    }
    return lines.join('\n').trim()
  }

  async function copyReport() {
    await navigator.clipboard.writeText(reportView === 'groups' ? buildGroupsText() : buildReportText())
    setReportCopied(true)
    setTimeout(() => setReportCopied(false), 2500)
  }

  // Name format
  const [nameFormat, setNameFormat] = useState<NameFormat>(() =>
    (localStorage.getItem('nameFormat') as NameFormat) ?? 'first'
  )
  const [showSkills, setShowSkills] = useState<boolean>(
    () => localStorage.getItem('showSkills') !== 'false'
  )
  function cycleNameFormat() {
    const next: NameFormat = nameFormat === 'full' ? 'first' : nameFormat === 'first' ? 'initials' : 'full'
    setNameFormat(next)
    localStorage.setItem('nameFormat', next)
  }
  function toggleShowSkills() {
    const next = !showSkills
    setShowSkills(next)
    localStorage.setItem('showSkills', String(next))
  }

  // Checkin notes (keyed by studentId, scoped to active lesson)
  const [checkinNotes, setCheckinNotes] = useState<Record<string, string>>({})
  const [noteModal, setNoteModal] = useState<{ studentId: string; studentName: string } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdTriggeredRef = useRef(false)
  const holdStudentRef = useRef<{ studentId: string; studentName: string } | null>(null)
  const suppressNextTapRef = useRef(false)

  function openNoteModal(studentId: string, studentName: string) {
    setNoteText(checkinNotes[studentId] ?? '')
    setSelectedSkills([])
    setNoteModal({ studentId, studentName })
  }

  function closeNoteModal() {
    setNoteModal(null)
    setNoteText('')
    setSelectedSkills([])
  }

  function getActiveLessonSkills(): string[] {
    if (!activeLesson || !savedPlan) return []
    const dayPlan = savedPlan.schedule[activeLesson.date]
    if (!dayPlan) return []

    const byActiveSubject = activeSubject ? dayPlan[activeSubject] : undefined
    const byTitle = Object.values(dayPlan).find(
      l => l.title.trim().toLowerCase() === activeLesson.title.trim().toLowerCase()
    )
    const rawSkills = (byActiveSubject?.skills ?? byTitle?.skills ?? [])
      .map(s => s.trim())
      .filter(Boolean)
    return [...new Set(rawSkills)]
  }

  function buildCheckinRows(lessonId: string, studentId: string, status: Status, note?: string | null) {
    const skills = getActiveLessonSkills()
    const base = {
      user_id: userId,
      lesson_id: lessonId,
      student_id: studentId,
      status,
      note: note ?? null,
    }
    if (skills.length > 0) {
      return skills.map(skill => ({ ...base, skill }))
    }
    return [{ ...base, skill: null as string | null }]
  }

  async function saveNote() {
    if (!noteModal || !activeLesson || isDemo) { closeNoteModal(); return }
    const { studentId } = noteModal
    const skillPrefix = selectedSkills.length > 0 ? `⚠️ Struggled with: ${selectedSkills.join(', ')}\n\n` : ''
    const fullNote = `${skillPrefix}${noteText}`.trim()
    setCheckinNotes(cur => ({ ...cur, [studentId]: fullNote }))
    await supabase
      .from('checkins')
      .upsert(
        buildCheckinRows(activeLesson.id, studentId, studentStatuses[studentId] ?? 'got-it', fullNote || null),
        { onConflict: 'lesson_id,student_id,skill' }
      )
    closeNoteModal()
    setHistoryVersion(v => v + 1)
  }

  function onCirclePointerDown(studentId: string, studentName: string) {
    holdTriggeredRef.current = false
    holdStudentRef.current = { studentId, studentName }
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      holdTriggeredRef.current = true
      if (navigator.vibrate) navigator.vibrate(30)
    }, 500)
  }

  function onCirclePointerUp(studentId: string, studentName: string) {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
    const shouldOpen = holdTriggeredRef.current
      && holdStudentRef.current?.studentId === studentId
      && holdStudentRef.current?.studentName === studentName
    holdTriggeredRef.current = false
    holdStudentRef.current = null
    if (shouldOpen) {
      suppressNextTapRef.current = true
      openNoteModal(studentId, studentName)
    }
  }

  function onCirclePointerCancel() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
    holdTriggeredRef.current = false
    holdStudentRef.current = null
  }

  // ── Load classes + students ──────────────────────────────────────────────

  useEffect(() => {
    if (isDemo) {
      const demoClasses = DEMO_CLASSES.map(c => ({ ...c }))
      const byClass: Record<string, AppStudent[]> = {}
      for (const cls of demoClasses) {
        const ids = DEMO_STUDENT_CLASSES.filter(sc => sc.class_id === cls.id).map(sc => sc.student_id)
        byClass[cls.id] = DEMO_STUDENTS.filter(s => ids.includes(s.id))
      }
      setTimeout(() => {
        setClasses(demoClasses)
        setSelectedClassId(demoClasses[0]?.id ?? '')
        setHistoryClassId(demoClasses[0]?.id ?? '')
        setStudentsByClass(byClass)
        setHistoryData(buildDemoHistory())
        setDataLoading(false)
      }, 0)
      return
    }

    async function load() {
      setDataLoading(true)
      const { data: cls } = await supabase
        .from('classes')
        .select('id, name, subject, display_order')
        .eq('user_id', userId)
        .order('display_order')

      const loaded = cls ?? []

      if (loaded.length === 0) {
        setDataLoading(false)
        onNeedsSetup?.()
        return
      }

      const firstClassId = loaded[0]?.id ?? ''

      const [{ data: scRows }, { data: wpData }, { data: mappingRows }] = await Promise.all([
        supabase
          .from('student_classes')
          .select('class_id, students(id, name)')
          .in('class_id', loaded.map(c => c.id)),
        supabase
          .from('week_plans')
          .select('id, week_start, plan_json, tracked_subjects')
          .eq('user_id', userId)
          .eq('week_start', weekStart)
          .maybeSingle(),
        supabase
          .from('subject_mappings')
          .select('plan_subject, class_subject')
          .eq('user_id', userId),
      ])

      const byClass: Record<string, AppStudent[]> = {}
      for (const cls of loaded) byClass[cls.id] = []
      for (const row of scRows ?? []) {
        const s = row.students as unknown as AppStudent
        if (s && byClass[row.class_id]) byClass[row.class_id].push(s)
      }

      if (mappingRows && mappingRows.length > 0) {
        const map: Record<string, string> = {}
        for (const r of mappingRows) map[r.plan_subject] = r.class_subject
        setSubjectMappings(map)
      }

      if (wpData) {
        const tracked = wpData.tracked_subjects ?? []
        const plan = { weekStart: wpData.week_start, schedule: wpData.plan_json, trackedSubjects: tracked, planId: wpData.id }
        setSavedPlan(plan)
        setCurrentWeekPlan(plan)
        const firstClassSubject = loaded[0]?.subject
        const preferred = firstClassSubject && tracked.includes(firstClassSubject) ? firstClassSubject : tracked[0]
        if (preferred) setActiveSubject(preferred)
      }

      setClasses(loaded)
      setSelectedClassId(firstClassId)
      setHistoryClassId(firstClassId)
      setStudentsByClass(byClass)
      setDataLoading(false)
    }
    load()
  }, [userId, isDemo, weekStart])

  // ── Reload week plan when week changes (plan is shared across all classes) ──

  useEffect(() => {
    if (isDemo || !userId) return
    const cls = classes.find(c => c.id === selectedClassId)
    supabase
      .from('week_plans')
      .select('id, week_start, plan_json, tracked_subjects')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const tracked = data.tracked_subjects ?? []
          const plan = { weekStart: data.week_start, schedule: data.plan_json, trackedSubjects: tracked, planId: data.id }
          setSavedPlan(plan)
          setCurrentWeekPlan(plan)
          const classSubject = cls?.subject
          const preferred = classSubject && tracked.includes(classSubject) ? classSubject : tracked[0]
          if (preferred) setActiveSubject(preferred)
        } else {
          setSavedPlan(null)
          setCurrentWeekPlan(null)
          if (cls?.subject) setActiveSubject(cls.subject)
        }
      })
  }, [isDemo, weekStart, userId])

  // ── Load history when switching to history screen ────────────────────────

  useEffect(() => {
    if (screen !== 'history' && screen !== 'reports') return
    if (isDemo) {
      setTimeout(() => setHistoryData(buildDemoHistory()), 0)
      return
    }
    async function loadHistory() {
      setHistoryLoading(true)
      // Loads since Sep 1 of the current school year (~4,500 rows max at 25 students x 180 days).
      // Fast today. If history ever feels slow, shrink this window first.
      const now = new Date()
      const schoolYearStart = now.getMonth() >= 8
        ? new Date(now.getFullYear(), 8, 1)
        : new Date(now.getFullYear() - 1, 8, 1)

      const { data } = await supabase
        .from('checkins')
        .select(`
          id, status, note, skill,
          lessons(id, title, date, class_id, classes(id, name)),
          students(id, name)
        `)
        .eq('user_id', userId)
        .gte('created_at', schoolYearStart.toISOString())
        .order('created_at', { ascending: false })
      type RawCheckin = { status: string; note?: string; skill?: string | null; lessons: { id: string; title: string; date: string; class_id: string; classes: { name: string } } | null; students: { id: string; name: string } | null }
      const rows: HistoryRow[] = ((data ?? []) as unknown as RawCheckin[]).map(r => ({
        class_id: r.lessons?.class_id ?? '',
        class_name: r.lessons?.classes?.name ?? '',
        student_id: r.students?.id ?? '',
        student_name: r.students?.name ?? '',
        lesson_id: r.lessons?.id ?? '',
        lesson_title: r.lessons?.title ?? '',
        date: r.lessons?.date ?? '',
        status: r.status,
        note: r.note ?? undefined,
        skill: r.skill ?? null,
      }))
      setHistoryData(rows)
      setHistoryLoading(false)
    }
    loadHistory()
  }, [screen, userId, isDemo, historyVersion])

  // ── Load plan when navigating to plan screen or switching week view ───────

  useEffect(() => {
    if (screen !== 'plan' || isDemo) return
    setSavedPlan(null)
    setPlanText('')
    setPlanError('')
    supabase
      .from('week_plans')
      .select('id, week_start, plan_json, tracked_subjects')
      .eq('user_id', userId)
      .eq('week_start', activePlanWeekStart)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const plan = { weekStart: data.week_start, schedule: data.plan_json, trackedSubjects: data.tracked_subjects ?? [], planId: data.id }
          setSavedPlan(plan)
          if (planViewWeek === 'current') setCurrentWeekPlan(plan)
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, userId, isDemo, activePlanWeekStart])

  // ── Lesson actions ────────────────────────────────────────────────────────

  async function startLessonByTitle(title: string, date?: string) {
    const lessonDate = date ?? today
    if (isDemo) {
      const found = DEMO_LESSONS.find(l => l.title === title && l.class_id === selectedClassId && l.date === lessonDate)
      setActiveLesson(found ?? { id: 'demo-new', class_id: selectedClassId, date: lessonDate, title })
      // Load demo checkins
      const map: Record<string, Status> = {}
      if (found) {
        for (const c of DEMO_CHECKINS.filter(c => c.lesson_id === found.id)) {
          map[c.student_id] = c.status
        }
      }
      setStudentStatuses(map)
      return
    }

    setLoading(true)
    // Upsert the lesson row
    const { data: existing } = await supabase
      .from('lessons')
      .select('id')
      .eq('class_id', selectedClassId)
      .eq('date', lessonDate)
      .eq('title', title)
      .maybeSingle()

    let lessonId: string
    if (existing) {
      lessonId = existing.id
    } else {
      const { data: inserted } = await supabase
        .from('lessons')
        .insert({ user_id: userId, class_id: selectedClassId, date: lessonDate, title })
        .select('id')
        .single()
      lessonId = inserted?.id ?? ''
    }

    const lesson: AppLesson = { id: lessonId, class_id: selectedClassId, date: lessonDate, title }
    setActiveLesson(lesson)

    // Load existing checkins
    const { data: checkins } = await supabase
      .from('checkins')
      .select('student_id, status, note')
      .eq('lesson_id', lessonId)
    // absent wins over needs-help: if any skill row is absent, the student was marked absent last
    const STATUS_SEVERITY: Record<string, number> = { 'absent': 4, 'needs-help': 3, 'almost': 2, 'got-it': 0 }
    const map: Record<string, Status> = {}
    const noteMap: Record<string, string> = {}
    for (const c of checkins ?? []) {
      const existing = map[c.student_id]
      if (!existing || (STATUS_SEVERITY[c.status] ?? 0) > (STATUS_SEVERITY[existing] ?? 0)) {
        map[c.student_id] = c.status as Status
      }
      if (c.note) noteMap[c.student_id] = c.note
    }
    setStudentStatuses(map)
    setCheckinNotes(noteMap)
    setLoading(false)
  }

  function startLesson() {
    const title = lessonInput.trim() || (() => {
      const d = new Date()
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' class'
    })()
    setExitTickets([])
    setActiveExitTicket(null)
    setShowExitTickets(false)
    startLessonByTitle(title)
  }

  function tap(studentId: string) {
    if (suppressNextTapRef.current) {
      suppressNextTapRef.current = false
      return
    }
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    if (!activeLesson) return
    // Unmarked students start the cycle at got-it; once marked they never
    // return to unmarked.
    const nextStatus = (current: Status | undefined): Status =>
      current === undefined
        ? 'got-it'
        : STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]
    if (isDemo) {
      setStudentStatuses(cur => ({ ...cur, [studentId]: nextStatus(cur[studentId]) }))
      return
    }
    setStudentStatuses(cur => {
      const next = nextStatus(cur[studentId])
      supabase
        .from('checkins')
        .upsert(
          buildCheckinRows(activeLesson.id, studentId, next, checkinNotes[studentId] ?? null),
          { onConflict: 'lesson_id,student_id,skill' }
        )
        .then()
      return { ...cur, [studentId]: next }
    })
  }

  function confirmAllGotIt() {
    if (!activeLesson || isDemo) return
    // Persist got-it only for students the teacher never tapped (no entry in
    // studentStatuses, so no checkin row exists yet). Students already marked
    // almost/needs-help/absent keep their flags.
    const toFlip = currentStudents.filter(s => studentStatuses[s.id] === undefined)
    if (toFlip.length === 0) return
    setStudentStatuses(cur => {
      const next = { ...cur }
      toFlip.forEach(s => { next[s.id] = 'got-it' })
      return next
    })
    supabase
      .from('checkins')
      .upsert(
        toFlip.flatMap(s => buildCheckinRows(activeLesson.id, s.id, 'got-it', checkinNotes[s.id] ?? null)),
        { onConflict: 'lesson_id,student_id,skill' }
      )
      .then(() => setHistoryVersion(v => v + 1))
  }

  function dismissCheckin(studentId: string, lessonId: string, skill: string | null | undefined, fromStatus?: Status) {
    setHistoryData(cur => cur.map(r =>
      r.student_id === studentId && r.lesson_id === lessonId && (r.skill ?? null) === (skill ?? null) && (!fromStatus || r.status === fromStatus)
        ? { ...r, status: 'got-it' }
        : r
    ))
    const row = historyData.find(r => r.student_id === studentId && r.lesson_id === lessonId && (r.skill ?? null) === (skill ?? null))
    supabase.from('checkins').upsert(
      [{ user_id: userId, lesson_id: lessonId, student_id: studentId, status: 'got-it' as Status, note: row?.note ?? null, skill: skill ?? null }],
      { onConflict: 'lesson_id,student_id,skill' }
    ).then()
  }

  function clearLesson(lessonId: string) {
    const rows = historyData.filter(r => r.lesson_id === lessonId && r.status !== 'absent' && r.status !== 'got-it')
    if (rows.length === 0) return
    setHistoryData(cur => cur.map(r =>
      r.lesson_id === lessonId && r.status !== 'absent' ? { ...r, status: 'got-it' } : r
    ))
    supabase.from('checkins').upsert(
      rows.map(r => ({ user_id: userId, lesson_id: lessonId, student_id: r.student_id, status: 'got-it' as Status, note: r.note ?? null, skill: r.skill ?? null })),
      { onConflict: 'lesson_id,student_id,skill' }
    ).then()
  }

  // ── Exit tickets ──────────────────────────────────────────────────────────

async function handleSuggestExitTicket() {
  if (!activeLesson) return
  setExitTicketLoading(true)
  setShowExitTickets(true)
  setActiveExitTicket(null)
  try {
      const lessonDate = activeLesson.date || today
      const dayPlan = savedPlan?.schedule[lessonDate]
      const byActiveSubject = activeSubject ? dayPlan?.[activeSubject] : undefined
      const byTitle = dayPlan
        ? Object.values(dayPlan).find(
            l => l.title.trim().toLowerCase() === activeLesson.title.trim().toLowerCase()
          )
        : undefined
      const lessonContext =
        byActiveSubject ??
        byTitle ??
        (activeLesson.objective
          ? {
              title: activeLesson.title,
              subject: activeSubject ?? 'General',
              objective: activeLesson.objective,
              activities: '',
              assessment: '',
            }
          : activeLesson.title)

      const tickets = await suggestExitTickets(lessonContext)
      setExitTickets(tickets)
  } catch {
      setExitTickets([{ title: 'Could not load suggestions', description: 'Check your API key.' }])
  } finally {
      setExitTicketLoading(false)
    }
  }

  // ── Week plan ─────────────────────────────────────────────────────────────

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPlanError('')
    try {
      setPlanText(await extractTextFromFile(file))
    } catch {
      setPlanError('Could not read file. Try copy/pasting the text instead.')
    }
    e.target.value = ''
  }

  async function handleSavePlan() {
    if (!planText.trim() || isDemo) return
    setPlanLoading(true)
    setPlanError('')
    setPlanSaved(false)
    try {
      const schedule = await parseLessonPlan(planText, activePlanWeekStart)
      const foundSubjects = new Set<string>()
      for (const day of Object.values(schedule)) for (const subj of Object.keys(day)) foundSubjects.add(subj)

      const classSubjects = new Set(classes.map(c => c.subject).filter(Boolean))

      // Apply saved mappings: rename plan subjects to class subjects in the schedule
      const renamedSchedule: WeekSchedule = {}
      for (const [date, day] of Object.entries(schedule)) {
        const renamedDay: Record<string, DayLesson> = {}
        for (const [subj, lesson] of Object.entries(day)) {
          const mapped = subjectMappings[subj] ?? subj
          renamedDay[mapped] = lesson
        }
        renamedSchedule[date] = renamedDay
      }

      // Find subjects that still don't match any class subject
      const renamedSubjects = new Set<string>()
      for (const day of Object.values(renamedSchedule)) for (const subj of Object.keys(day)) renamedSubjects.add(subj)
      const unmatched = [...renamedSubjects].filter(s => !classSubjects.has(s))

      if (unmatched.length > 0) {
        // Show mapping UI — teacher needs to link these to their classes
        const draft: Record<string, string> = {}
        for (const s of unmatched) draft[s] = [...classSubjects][0] ?? s
        setPendingMappings(draft)
        setUnmappedSubjects(unmatched)
        setPendingSchedule(renamedSchedule)
        setSubjectChoices([...renamedSubjects].sort())
      } else {
        // All subjects matched — go straight to subject confirmation step
        setPendingSchedule(renamedSchedule)
        setSubjectChoices([...renamedSubjects].sort())
      }
      setPlanText('')
    } catch (err) {
      setPlanError(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPlanLoading(false)
    }
  }

  async function confirmMappings() {
    if (!pendingSchedule || isDemo) return
    // Apply the pending mappings to the schedule
    const updatedSchedule: WeekSchedule = {}
    for (const [date, day] of Object.entries(pendingSchedule)) {
      const updatedDay: Record<string, DayLesson> = {}
      for (const [subj, lesson] of Object.entries(day)) {
        const mapped = pendingMappings[subj] ?? subj
        updatedDay[mapped] = lesson
      }
      updatedSchedule[date] = updatedDay
    }

    // Save mappings to DB
    const newMappings = { ...subjectMappings }
    const upsertRows = unmappedSubjects.map(planSubj => ({
      user_id: userId,
      plan_subject: planSubj,
      class_subject: pendingMappings[planSubj] ?? planSubj,
    }))
    if (upsertRows.length > 0) {
      await supabase
        .from('subject_mappings')
        .upsert(upsertRows, { onConflict: 'user_id,plan_subject' })
      for (const row of upsertRows) newMappings[row.plan_subject] = row.class_subject
      setSubjectMappings(newMappings)
    }

    // Update pending schedule and choices, clear mapping state
    const updatedSubjects = new Set<string>()
    for (const day of Object.values(updatedSchedule)) for (const s of Object.keys(day)) updatedSubjects.add(s)
    setPendingSchedule(updatedSchedule)
    setSubjectChoices([...updatedSubjects].sort())
    setUnmappedSubjects([])
    setPendingMappings({})
  }

  async function confirmSubjects() {
    if (!pendingSchedule || subjectChoices.length === 0 || isDemo) return
    setPlanSaving(true)
    const filtered: WeekSchedule = {}
    for (const [date, day] of Object.entries(pendingSchedule)) {
      const kept: Record<string, DayLesson> = {}
      for (const subj of subjectChoices) if (day[subj]) kept[subj] = day[subj]
      if (Object.keys(kept).length > 0) filtered[date] = kept
    }
    const { data } = await supabase
      .from('week_plans')
      .upsert({ user_id: userId, week_start: activePlanWeekStart, plan_json: filtered, tracked_subjects: subjectChoices }, { onConflict: 'user_id,week_start' })
      .select('id')
      .single()
    const newPlan = { weekStart: activePlanWeekStart, schedule: filtered, trackedSubjects: subjectChoices, planId: data?.id }
    setSavedPlan(newPlan)
    if (planViewWeek === 'current') {
      setCurrentWeekPlan(newPlan)
      const cls = classes.find(c => c.id === selectedClassId)
      const subjectForClass = cls?.subject && subjectChoices.includes(cls.subject) ? cls.subject : subjectChoices[0]
      setActiveSubject(subjectForClass)
      const todayDay = filtered[today]
      if (todayDay?.[subjectForClass]) setLessonInput(todayDay[subjectForClass].title)
    }
    setPendingSchedule(null)
    setPlanSaving(false)
    setPlanSaved(true)
    setTimeout(() => setPlanSaved(false), 3000)
  }

  async function persistSchedule(schedule: WeekSchedule, snapshot?: WeekSchedule) {
    if (!savedPlan || isDemo) return
    if (snapshot !== undefined) setUndoSnapshot(snapshot)
    setPlanSaving(true)
    await supabase
      .from('week_plans')
      .upsert({ user_id: userId, week_start: activePlanWeekStart, plan_json: schedule, tracked_subjects: savedPlan.trackedSubjects }, { onConflict: 'user_id,week_start' })
    const updated = { ...savedPlan, schedule }
    setSavedPlan(updated)
    if (planViewWeek === 'current') {
      setCurrentWeekPlan(updated)
      const todayDay = schedule[today]
      const subj = activeSubject ?? savedPlan.trackedSubjects[0]
      if (todayDay?.[subj]) setLessonInput(todayDay[subj].title)
    }
    setPlanSaving(false)
  }

  async function handleUndo() {
    if (!undoSnapshot) return
    await persistSchedule(undoSnapshot)
    setUndoSnapshot(null)
  }

  function startEdit(dateISO: string, subject: string) {
    const lesson = savedPlan?.schedule[dateISO]?.[subject]
    setEditingDay(dateISO)
    setEditSubject(subject)
    setEditDraft(lesson ? { ...lesson } : { title: '', subject, objective: '', activities: '', assessment: '' })
    setExpandedDay(null)
    setSwapSource(null)
  }

  async function saveEdit() {
    if (!savedPlan || !editingDay || !editSubject || !editDraft) return
    const snapshot: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    const schedule: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    if (editDraft.title.trim()) {
      if (!schedule[editingDay]) schedule[editingDay] = {}
      schedule[editingDay][editSubject] = editDraft
    } else {
      if (schedule[editingDay]) {
        delete schedule[editingDay][editSubject]
        if (Object.keys(schedule[editingDay]).length === 0) delete schedule[editingDay]
      }
    }
    setEditingDay(null); setEditSubject(null); setEditDraft(null)
    await persistSchedule(schedule, snapshot)
  }

  async function skipDay(dateISO: string, pushBack: boolean) {
    if (!savedPlan) return
    const snapshot: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    const schedule: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    if (!pushBack) {
      delete schedule[dateISO]
    } else {
      const [y, m, d] = dateISO.split('-').map(Number)
      const skippedDate = new Date(y, m - 1, d)
      const datesToShift = Object.keys(schedule)
        .filter(k => { const [ky, km, kd] = k.split('-').map(Number); return new Date(ky, km - 1, kd) >= skippedDate })
        .sort()
      const shifted: WeekSchedule = {}
      for (const k of datesToShift) {
        shifted[nextISOWeekday(k)] = schedule[k]
      }
      for (const k of datesToShift) delete schedule[k]
      Object.assign(schedule, shifted)
    }
    setExpandedDay(null); setSkipConfirmDay(null)
    await persistSchedule(schedule, snapshot)
  }

  async function handleSwap(dateISO: string) {
    if (!savedPlan) return
    if (!swapSource) { setSwapSource(dateISO); setExpandedDay(null); return }
    if (swapSource === dateISO) { setSwapSource(null); return }
    const snapshot: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    const schedule: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    const a = schedule[swapSource]; const b = schedule[dateISO]
    if (a) schedule[dateISO] = a; else delete schedule[dateISO]
    if (b) schedule[swapSource] = b; else delete schedule[swapSource]
    setSwapSource(null)
    await persistSchedule(schedule, snapshot)
  }

  async function skipSubject(dateISO: string, subject: string, pushBack: boolean) {
    if (!savedPlan) return
    const snapshot: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    const schedule: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    if (!pushBack) {
      if (schedule[dateISO]) {
        delete schedule[dateISO][subject]
        if (Object.keys(schedule[dateISO]).length === 0) delete schedule[dateISO]
      }
    } else {
      const [y, m, d] = dateISO.split('-').map(Number)
      const skippedDate = new Date(y, m - 1, d)
      const datesToShift = Object.keys(schedule)
        .filter(k => { const [ky, km, kd] = k.split('-').map(Number); return new Date(ky, km - 1, kd) >= skippedDate })
        .sort()
      // collect subject's lesson for each day from skipped date onward
      const subjectByDay: Record<string, WeekSchedule[string][string]> = {}
      for (const k of datesToShift) {
        if (schedule[k][subject]) subjectByDay[k] = schedule[k][subject]
      }
      // remove this subject from all affected days
      for (const k of datesToShift) {
        delete schedule[k][subject]
        if (Object.keys(schedule[k]).length === 0) delete schedule[k]
      }
      // write each subject lesson to the next weekday, dropping Friday's (it falls off)
      for (const k of datesToShift) {
        if (!subjectByDay[k]) continue
        const next = nextISOWeekday(k)
        if (!schedule[next]) schedule[next] = {}
        schedule[next][subject] = subjectByDay[k]
      }
    }
    setExpandedDay(null); setSkipConfirmSubject(null)
    await persistSchedule(schedule, snapshot)
  }

  async function handleSwapSubject(dateISO: string, subject: string) {
    if (!savedPlan) return
    if (!swapSubjectSource) {
      setSwapSubjectSource({ dateISO, subject })
      return
    }
    if (swapSubjectSource.dateISO === dateISO && swapSubjectSource.subject === subject) {
      setSwapSubjectSource(null)
      return
    }
    const snapshot: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    const schedule: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    const srcLesson = schedule[swapSubjectSource.dateISO]?.[subject]
    const dstLesson = schedule[dateISO]?.[subject]
    if (srcLesson) {
      if (!schedule[dateISO]) schedule[dateISO] = {}
      schedule[dateISO][subject] = srcLesson
    } else if (schedule[dateISO]) {
      delete schedule[dateISO][subject]
      if (Object.keys(schedule[dateISO]).length === 0) delete schedule[dateISO]
    }
    if (dstLesson) {
      if (!schedule[swapSubjectSource.dateISO]) schedule[swapSubjectSource.dateISO] = {}
      schedule[swapSubjectSource.dateISO][subject] = dstLesson
    } else if (schedule[swapSubjectSource.dateISO]) {
      delete schedule[swapSubjectSource.dateISO][subject]
      if (Object.keys(schedule[swapSubjectSource.dateISO]).length === 0) delete schedule[swapSubjectSource.dateISO]
    }
    setSwapSubjectSource(null)
    await persistSchedule(schedule, snapshot)
  }

  async function copyToNext(dateISO: string) {
    if (!savedPlan) return
    const day = savedPlan.schedule[dateISO]
    if (!day) return
    const nextISO = nextISOWeekday(dateISO)
    const snapshot: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    const schedule: WeekSchedule = JSON.parse(JSON.stringify(savedPlan.schedule))
    schedule[nextISO] = JSON.parse(JSON.stringify(day))
    setExpandedDay(null)
    await persistSchedule(schedule, snapshot)
  }

  function switchSubject(subject: string) {
    setActiveSubject(subject)
    setStudentStatuses({})
    setExitTickets([]); setActiveExitTicket(null); setShowExitTickets(false)
    const todaySchedule = savedPlan?.schedule[today]
    const matchKey = todaySchedule ? Object.keys(todaySchedule).find(k => k.toLowerCase() === subject.toLowerCase()) : undefined
    const planTitle = matchKey ? todaySchedule![matchKey].title : undefined
    if (planTitle) {
      setLessonInput(planTitle)
      startLessonByTitle(planTitle)
    } else {
      setActiveLesson(null); setLessonInput(''); setStudentStatuses({})
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const duplicateNames = new Set(
    classes.map(c => c.name).filter((n, _, arr) => arr.filter(x => x === n).length > 1)
  )
  function classLabel(cls: AppClass) {
    return duplicateNames.has(cls.name) ? `${cls.subject} · ${cls.name}` : cls.name
  }

  const currentStudents = studentsByClass[selectedClassId] ?? []
  const historyStudents = studentsByClass[historyClassId] ?? []

  const filteredHistory = historyData.filter(r => r.class_id === historyClassId)

  const studentHistoryRows = selectedStudentId
    ? historyData.filter(r => r.student_id === selectedStudentId).sort((a, b) => a.date.localeCompare(b.date))
    : []

  const lessonGroups = useMemo(() => {
    const map = new Map<string, HistoryRow[]>()
    for (const row of filteredHistory) {
      const key = `${row.date}||${row.lesson_id}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return [...map.entries()].map(([key, rows]) => {
      const [date] = key.split('||')
      return { date, lesson_id: rows[0].lesson_id, lesson_title: rows[0].lesson_title, rows }
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [filteredHistory])

  const lessonDetail = selectedLesson
    ? historyData.filter(r => r.lesson_id === selectedLesson.lesson_id)
    : []

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  function getDateForDayOffset(offset: number) {
    const [y, m, d] = activePlanWeekStart.split('-').map(Number)
    const dt = new Date(y, m - 1, d + offset)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }

  const STATUS_SCORE: Record<string, number> = { 'got-it': 3, 'almost': 2, 'needs-help': 1 }

  const repeatStrugglers = useMemo(() => {
    const d = new Date(`${today}T12:00:00`)
    d.setDate(d.getDate() - 6)
    const cutoff = d.toISOString().slice(0, 10)
    const subjectByClass = new Map(classes.map(c => [c.id, c.subject]))
    const byStudent = new Map<string, Map<string, { label: string; dates: Set<string> }>>()
    for (const r of historyData) {
      if (r.status !== 'needs-help') continue
      if (r.date < cutoff || r.date > today) continue
      const skill = r.skill?.trim()
      const key = skill ? `skill|${skill}` : `class|${r.class_id}`
      const label = skill || subjectByClass.get(r.class_id) || r.class_name
      if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, new Map())
      const groups = byStudent.get(r.student_id)!
      if (!groups.has(key)) groups.set(key, { label, dates: new Set() })
      groups.get(key)!.dates.add(r.date)
    }
    const result = new Map<string, { label: string; days: number }>()
    for (const [studentId, groups] of byStudent) {
      let worst: { label: string; days: number } | null = null
      for (const { label, dates } of groups.values()) {
        if (dates.size >= 2 && (!worst || dates.size > worst.days)) worst = { label, days: dates.size }
      }
      if (worst) result.set(studentId, worst)
    }
    return result
  }, [historyData, classes, today])

  const { atRiskStudentIds, sortedCurrentStudents } = useMemo(() => {
    const scores = new Map<string, number>()
    for (const student of currentStudents) {
      const rows = historyData
        .filter(r => r.student_id === student.id && r.status !== 'absent')
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10)
      if (rows.length >= 2) {
        const avg = rows.reduce((sum, r) => sum + (STATUS_SCORE[r.status] ?? 2), 0) / rows.length
        scores.set(student.id, avg)
      }
    }
    const ids = new Set(
      [...scores.entries()].filter(([, avg]) => avg < 1.8).map(([id]) => id)
    )
    for (const id of repeatStrugglers.keys()) ids.add(id)
    const sorted = [...currentStudents].sort((a, b) => {
      const aAt = ids.has(a.id), bAt = ids.has(b.id)
      if (aAt && !bAt) return -1
      if (!aAt && bAt) return 1
      return (scores.get(a.id) ?? 3) - (scores.get(b.id) ?? 3)
    })
    return { atRiskStudentIds: ids, sortedCurrentStudents: sorted }
  }, [historyData, currentStudents, repeatStrugglers])

  const todayFlaggedCount = useMemo(() => {
    const ids = new Set<string>()
    for (const r of historyData) {
      if (r.date === today && (r.status === 'needs-help' || r.status === 'almost')) ids.add(r.student_id)
    }
    return ids.size
  }, [historyData, today])

  function goToTodayGroups() {
    setReportRange('today')
    setReportClassId('all')
    setReportView('groups')
    setScreen('reports')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (dataLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: '#0d0d0f' }}>
        <svg className="animate-spin h-8 w-8 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        <p className="text-sm" style={{ color: '#8b8b9a' }}>Loading…</p>
      </div>
    )
  }

  const screenProps = {
    formatWeek, weekStart: activePlanWeekStart, nextWeekStart, planViewWeek, setPlanViewWeek, pendingSchedule, subjectChoices, setSubjectChoices, confirmSubjects, planSaving, setPendingSchedule,
    savedPlan, undoSnapshot, handleUndo, swapSource, setSwapSource, swapSubjectSource, setSwapSubjectSource, DAYS, getDateForDayOffset,
    today, expandedDay, editingDay, editDraft, editSubject, setEditDraft, saveEdit, setEditingDay, setEditSubject, handleSwap, startEdit,
    setExpandedDay, handleSwapSubject, skipConfirmSubject, setSkipConfirmSubject, skipSubject, copyToNext, skipConfirmDay, setSkipConfirmDay,
    skipDay, setSavedPlan, fileInputRef, handleFileUpload, planText, setPlanText, planError, handleSavePlan, planLoading, planSaved,
    unmappedSubjects, pendingMappings, setPendingMappings, confirmMappings,
    activeLesson, isDemo, handleSuggestExitTicket, exitTicketLoading, setActiveLesson, setLessonInput, setExitTickets, setActiveExitTicket, setShowExitTickets,
    activeSubject, setLessonInputExternal: setLessonInput, startLessonByTitle, formatDate, lessonInput, startLesson, DEMO_LESSONS, selectedClassId,
    showExitTickets, activeExitTicket, exitTickets, currentStudents: sortedCurrentStudents, loading, studentStatuses, formatStudentName, nameFormat, STATUS_DOT, STATUS_INITIAL_BG, STATUS_RING, STATUS_CARD, tap, confirmAllGotIt,
    historyData,
    historyTab, setHistoryTab, setSelectedStudentId, setSelectedLesson, classes, setHistoryClassId, historyClassId, classLabel,
    historyLoading, selectedStudentId, historyStudents, studentHistoryRows, STATUS_PILL, STATUS_LABEL,
    filteredHistory, selectedLesson, lessonDetail, lessonGroups,
    reportClassId, setReportClassId, reportRange, setReportRange, reportCustomStart, setReportCustomStart, reportCustomEnd,
    setReportCustomEnd, reportData, copyReport, reportCopied, dismissCheckin, clearLesson, reportView, setReportView,
    rosterAddingClass, setRosterAddingClass, rosterNewClassName, setRosterNewClassName, rosterAddClass, rosterNewClassSubject,
    setRosterNewClassSubject, SUBJECTS, rosterSaving, studentsByClass, rosterRenaming, rosterRenameValue, setRosterRenameValue, rosterRenameClass,
    setRosterRenaming, rosterConfirmRemove, rosterRemoveStudent, setRosterConfirmRemove, rosterNewStudentName, setRosterNewStudentName,
    rosterAddStudent, setRosterPasteClassId, setRosterPasteText, setRosterCopySourceClassId, setRosterCopyTargetClassId, rosterCopySourceClassId,
    rosterCopyTargetClassId, rosterCopyFromClass, rosterPasteClassId, rosterPasteText, rosterParsing, rosterBulkAdd,
    setScreen,
    onGoToPlan: () => setScreen('plan'),
    rosterRenamingStudent, setRosterRenamingStudent, rosterStudentRenameValue, setRosterStudentRenameValue, rosterRenameStudent,
    expandedRosterClassId, setExpandedRosterClassId,
    cycleNameFormat,
    showSkills,
    toggleShowSkills,
    openProfile,
    checkinNotes, atRiskStudentIds, onCirclePointerDown, onCirclePointerUp, onCirclePointerCancel,
    todayFlaggedCount, goToTodayGroups, repeatStrugglers,
  };

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
                onClick={() => { setScreen('plan'); setSelectedStudentId(null); setSelectedLesson(null) }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${screen === 'plan' ? 'bg-teal-900/50 text-teal-400' : 'hover:bg-white/5'}`}
                style={screen !== 'plan' ? { color: '#8b8b9a' } : {}}
              >
                Week Plan
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setScreen(screen === 'history' ? 'tracker' : 'history')
                setSelectedStudentId(null)
                setSelectedLesson(null)
              }}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${screen === 'history' ? 'bg-teal-900/50 text-teal-400' : 'hover:bg-white/5'}`}
              style={screen !== 'history' ? { color: '#8b8b9a' } : {}}
            >
              {screen === 'history' ? 'Done' : 'History'}
            </button>
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
            <button
              type="button"
              onClick={() => setScreen(screen === 'reports' ? 'tracker' : 'reports')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${screen === 'reports' ? 'bg-teal-900/50 text-teal-400' : 'hover:bg-white/5'}`}
              style={screen !== 'reports' ? { color: '#8b8b9a' } : {}}
            >
              {screen === 'reports' ? 'Done' : 'Reports'}
            </button>
            {(screen === 'plan') && (
              <button type="button" onClick={() => setScreen('tracker')} className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/5" style={{ color: '#8b8b9a' }}>Done</button>
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
        {/* Class tabs — wrapping rows */}
        {screen === 'tracker' && classes.length > 1 && (
          <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex flex-wrap gap-2">
              {classes.map(cls => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => { setSelectedClassId(cls.id); switchSubject(cls.subject) }}
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

      {/* Subject tabs — only shown when the class has no fixed subject (e.g. homeroom covering multiple subjects) */}
      {(() => {
        const selectedClass = classes.find(c => c.id === selectedClassId)
        const classHasFixedSubject = selectedClass?.subject && currentWeekPlan?.trackedSubjects.includes(selectedClass.subject)
        return screen === 'tracker' && currentWeekPlan && currentWeekPlan.trackedSubjects.length > 1 && !classHasFixedSubject
      })() && (
        <div className="px-4 overflow-x-auto scrollbar-none" style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex gap-6 min-w-max">
          {savedPlan?.trackedSubjects.map(subj => (
            <button
              key={subj}
              type="button"
              onClick={() => switchSubject(subj)}
              className={`px-0 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeSubject === subj ? 'border-teal-500 text-teal-400' : 'border-transparent'
              }`}
              style={activeSubject !== subj ? { color: '#5a5a6a' } : {}}
            >
              {subj}
            </button>
          ))}
          </div>
        </div>
      )}

      
  

      {/* ── PLAN SCREEN ── */}
      {screen === 'plan' && <PlanScreen {...screenProps} />}
      {screen === 'tracker' && <TrackerScreen {...screenProps} savedPlan={currentWeekPlan} atRiskStudentIds={atRiskStudentIds} />}
      {screen === 'history' && <HistoryScreen {...screenProps} />}
      {screen === 'reports' && <ReportsScreen {...screenProps} />}
      {screen === 'roster' && <RosterScreen {...screenProps} />}
      
      {/* ── Bottom tab bar ── revert: remove this block + remove pb-20 above + change "hidden" back to "flex" on header nav div */}
      <nav className="fixed bottom-0 left-0 right-0 backdrop-blur z-50" style={{ background: 'rgba(17,17,19,0.97)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-stretch h-16">
          {/* Tracker */}
          <button
            type="button"
            onClick={() => { setScreen('tracker'); setSelectedStudentId(null); setSelectedLesson(null) }}
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
              onClick={() => { setScreen('plan'); setSelectedStudentId(null); setSelectedLesson(null) }}
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

          {/* History */}
          <button
            type="button"
            onClick={() => { setScreen('history'); setSelectedStudentId(null); setSelectedLesson(null) }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors relative"
            style={{ color: screen === 'history' ? '#fbbf24' : '#5a5a6a' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
            </svg>
            History
            {screen === 'history' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-amber-400 rounded-full" />}
          </button>

          {/* Roster */}
          {!isDemo && (
            <button
              type="button"
              onClick={() => { setScreen('roster'); setSelectedStudentId(null); setSelectedLesson(null) }}
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

          {/* Reports */}
          <button
            type="button"
            onClick={() => { setScreen('reports'); setSelectedStudentId(null); setSelectedLesson(null) }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors relative"
            style={{ color: screen === 'reports' ? '#fb7185' : '#5a5a6a' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" />
            </svg>
            Reports
            {screen === 'reports' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-rose-400 rounded-full" />}
          </button>

          {/* Sign out */}
          {!isDemo && (
            confirmSignOut ? (
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
            )
          )}
        </div>
      </nav>

      <StudentProfileSheet
        studentId={profileStudentId}
        studentName={profileStudentName}
        historyData={historyData}
        classes={classes}
        onClose={closeProfile}
      />

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={closeNoteModal}>
          <div className="w-full max-w-lg rounded-t-3xl px-5 pt-5 pb-8 shadow-xl" style={{ background: '#161618' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold" style={{ color: '#f0f0f2' }}>
                Note — {formatStudentName(noteModal.studentName, nameFormat, currentStudents.map(s => s.name))}
              </p>
              <button type="button" onClick={closeNoteModal} className="text-lg leading-none" style={{ color: '#5a5a6a' }}>✕</button>
            </div>
            {showSkills && getActiveLessonSkills().length >= 2 && (
              <div className="mb-3">
                <p className="text-xs mb-2" style={{ color: '#8b8b9a' }}>Struggled with:</p>
                <div className="flex flex-wrap gap-2">
                  {getActiveLessonSkills().map(skill => {
                    const selected = selectedSkills.includes(skill)
                    return (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => setSelectedSkills(cur => selected ? cur.filter(s => s !== skill) : [...cur, skill])}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={selected
                          ? { background: 'rgba(250,204,21,0.15)', color: '#facc15', border: '1px solid rgba(250,204,21,0.4)' }
                          : { background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}
                      >
                        {skill}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="relative">
              <textarea
                autoFocus
                rows={4}
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="What was the student struggling with?"
                className="w-full rounded-2xl px-4 py-3 pr-12 text-sm outline-none focus:border-teal-500 resize-none border"
                style={{ background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }}
              />
              <MicButton onTranscript={text => setNoteText(cur => cur ? cur + ' ' + text : text)} />
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={closeNoteModal} className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-colors" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
              <button type="button" onClick={saveNote} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-teal-500 hover:bg-teal-600 transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

