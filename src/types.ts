import type { DayLesson, WeekSchedule, ExitTicket } from './lib/groq'
import type { DemoLesson } from './lib/demo'

export type Status = 'got-it' | 'almost' | 'needs-help' | 'absent'
export type ReportRange = 'today' | 'week' | 'month' | 'custom' | 'all'
export type Screen = 'tracker' | 'history' | 'plan' | 'roster' | 'reports'
export type HistoryTab = 'student' | 'lesson'
export type NameFormat = 'full' | 'first' | 'initials'

export type AppClass = {
  id: string
  name: string
  subject: string
  display_order: number
}

export type AppStudent = {
  id: string
  name: string
}

export type AppLesson = {
  id: string
  class_id: string
  date: string
  title: string
  objective?: string
}

export type HistoryRow = {
  class_id: string
  class_name: string
  student_id: string
  student_name: string
  lesson_id: string
  lesson_title: string
  date: string
  status: string
  note?: string
  skill?: string | null
}

export type SavedPlan = {
  weekStart: string
  schedule: WeekSchedule
  trackedSubjects: string[]
  planId?: string
}

export type ReportStudent = {
  id: string
  name: string
  lessons: { lessonId: string; title: string; date: string; status: 'needs-help' | 'almost' | 'absent'; skill?: string | null }[]
  notes: { date: string; lessonTitle: string; text: string }[]
}

export type ReportClass = {
  classId: string
  className: string
  needsSupport: ReportStudent[]
  checkIn: ReportStudent[]
  absent: ReportStudent[]
}

export interface TrackerScreenProps {
  activeLesson: AppLesson | null
  isDemo: boolean
  handleSuggestExitTicket: () => void
  exitTicketLoading: boolean
  setActiveLesson: (lesson: AppLesson | null) => void
  setLessonInput: (input: string) => void
  setExitTickets: (tickets: ExitTicket[]) => void
  setActiveExitTicket: (ticket: ExitTicket | null) => void
  setShowExitTickets: (show: boolean) => void
  activeSubject: string | null
  savedPlan: SavedPlan | null
  setLessonInputExternal: (input: string) => void
  startLessonByTitle: (title: string, date?: string) => void
  formatDate: (iso: string) => string
  lessonInput: string
  startLesson: () => void
  DEMO_LESSONS: DemoLesson[] // From demo.ts
  selectedClassId: string
  showExitTickets: boolean
  activeExitTicket: ExitTicket | null
  exitTickets: ExitTicket[]
  currentStudents: AppStudent[]
  loading: boolean
  studentStatuses: Record<string, Status>
  formatStudentName: (fullName: string, format: NameFormat, classmates: string[]) => string
  nameFormat: NameFormat
  STATUS_INITIAL_BG: Record<Status | 'unmarked', string>
  STATUS_RING: Record<Status | 'unmarked', string>
  STATUS_CARD: Record<Status | 'unmarked', string>
  tap: (studentId: string) => void
  confirmAllGotIt: () => void
  openProfile: (id: string, name: string) => void
  checkinNotes: Record<string, string>
  atRiskStudentIds: Set<string>
  onCirclePointerDown: (studentId: string, studentName: string) => void
  onCirclePointerUp: (studentId: string, studentName: string) => void
  onCirclePointerCancel: () => void
  showSkills: boolean
  onGoToPlan: () => void
  todayFlaggedCount: number
  goToTodayGroups: () => void
}

export interface RosterScreenProps {
  classes: AppClass[]
  studentsByClass: Record<string, AppStudent[]>
  rosterRenaming: string | null
  rosterRenameValue: string
  setRosterRenameValue: (val: string) => void
  rosterRenameClass: (id: string) => void
  setRosterRenaming: (id: string | null) => void
  rosterAddingClass: boolean
  setRosterAddingClass: (adding: boolean) => void
  rosterNewClassName: string
  setRosterNewClassName: (val: string) => void
  rosterNewClassSubject: string
  setRosterNewClassSubject: (val: string) => void
  rosterAddClass: () => void
  rosterSaving: boolean
  expandedRosterClassId: string | null
  setExpandedRosterClassId: (id: string | null) => void
  rosterRenamingStudent: string | null
  setRosterRenamingStudent: (id: string | null) => void
  rosterStudentRenameValue: string
  setRosterStudentRenameValue: (val: string) => void
  rosterRenameStudent: (id: string) => void
  rosterConfirmRemove: { studentId: string; classId: string } | null
  setRosterConfirmRemove: (val: { studentId: string; classId: string } | null) => void
  rosterRemoveStudent: (sid: string, cid: string) => void
  rosterNewStudentName: Record<string, string>
  setRosterNewStudentName: (val: (cur: Record<string, string>) => Record<string, string>) => void
  rosterAddStudent: (cid: string) => void
  rosterPasteClassId: string | null
  setRosterPasteClassId: (id: string | null) => void
  rosterPasteText: string
  setRosterPasteText: (val: string) => void
  rosterBulkAdd: (cid: string) => void
  rosterParsing: boolean
  rosterCopySourceClassId: string | null
  setRosterCopySourceClassId: (id: string | null) => void
  rosterCopyFromClass: () => void
  rosterCopyTargetClassId: string
  setRosterCopyTargetClassId: (id: string) => void
}

export interface ReportsScreenProps {
  classes: AppClass[]
  reportClassId: string
  setReportClassId: (id: string) => void
  reportRange: string
  setReportRange: (range: ReportRange) => void
  reportCustomStart: string
  setReportCustomStart: (val: string) => void
  reportCustomEnd: string
  setReportCustomEnd: (val: string) => void
  reportData: ReportClass[]
  copyReport: () => void
  reportCopied: boolean
  dismissCheckin: (studentId: string, lessonId: string, skill: string | null | undefined, fromStatus?: Status) => void
  clearLesson: (lessonId: string) => void
  reportView: 'list' | 'groups'
  setReportView: (view: 'list' | 'groups') => void
  isDemo: boolean
}

export interface HistoryScreenProps {
  historyTab: HistoryTab
  setHistoryTab: (tab: HistoryTab) => void
  classes: AppClass[]
  historyClassId: string
  setHistoryClassId: (id: string) => void
  historyLoading: boolean
  historyData: HistoryRow[]
  selectedStudentId: string | null
  setSelectedStudentId: (id: string | null) => void
  formatStudentName: (fullName: string, format: NameFormat, classmates: string[]) => string
  nameFormat: NameFormat
  selectedLesson: { lesson_id: string; lesson_title: string; date: string } | null
  setSelectedLesson: (val: { lesson_id: string; lesson_title: string; date: string } | null) => void
}

export interface PlanScreenProps {
  savedPlan: SavedPlan | null
  planLoading: boolean
  planError: string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  planText: string
  setPlanText: (val: string) => void
  generatePlan?: () => void
  pendingSchedule: WeekSchedule | null
  setPendingSchedule: (val: WeekSchedule | null) => void
  setSubjectChoices: (val: string[]) => void
  setSavedPlan: (val: SavedPlan | null) => void
  classes: AppClass[]
  selectedClassId: string
  savePlan?: (schedule: WeekSchedule, tracked: string[]) => void
  planSaving: boolean
  planSaved: boolean
  unmappedSubjects: string[]
  pendingMappings: Record<string, string>
  setPendingMappings: (m: Record<string, string>) => void
  confirmMappings: () => void
  expandedDay: string | null
  setExpandedDay: (day: string | null) => void
  editingDay: string | null
  setEditingDay: (day: string | null) => void
  editSubject: string | null
  setEditSubject: (subject: string | null) => void
  editDraft: DayLesson | null
  setEditDraft: (lesson: DayLesson | null) => void
  undoSnapshot: WeekSchedule | null
  undoPlanChange?: () => void
  swapSource: string | null
  setSwapSource: (val: string | null) => void
  swapDay?: (target: string) => void
  skipConfirmDay: string | null
  setSkipConfirmDay: (day: string | null) => void
  skipDay: (day: string, pushRemaining: boolean) => void
  swapSubjectSource: { dateISO: string; subject: string } | null
  setSwapSubjectSource: (val: { dateISO: string; subject: string } | null) => void
  swapSubject?: (targetDate: string, targetSubject: string) => void
  skipConfirmSubject: { dateISO: string; subject: string } | null
  setSkipConfirmSubject: (val: { dateISO: string; subject: string } | null) => void
  skipSubject: (date: string, subject: string, pushRemaining: boolean) => void
  formatDate: (iso: string) => string
}
