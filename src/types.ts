export type Screen = 'tracker' | 'plan' | 'roster'
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
  rosterDeletingClass: string | null
  setRosterDeletingClass: (id: string | null) => void
  rosterDeleteConfirmText: string
  setRosterDeleteConfirmText: (val: string) => void
  rosterDeleteError: string
  rosterDeleteClass: (id: string) => void
  rosterCancelDeleteClass: () => void
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
