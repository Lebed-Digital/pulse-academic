import type { AppClass } from '../types'

// Deleting a class relies on ON DELETE CASCADE in Postgres: removing the classes
// row also removes student_classes, lessons, checkins (via lessons), skills and
// skill_mastery (via skills). Students survive on purpose, they are only linked
// through student_classes and may belong to other classes.
// week_plans is NOT class scoped despite having a class_id column: it has no
// foreign key and the app loads it by user_id + week_start, so it is left alone.

export function isDeleteConfirmed(typed: string, className: string): boolean {
  return typed.trim() === className.trim() && className.trim().length > 0
}

export function classesAfterDelete(classes: AppClass[], classId: string): AppClass[] {
  return classes.filter(c => c.id !== classId)
}

/**
 * Which class should be active once `classId` is gone.
 * Returns the current selection when it survives, the first remaining class when
 * the active one was deleted, and '' when nothing is left so the app falls back
 * to its existing no-class empty state.
 */
export function nextSelectedClassId(
  classes: AppClass[],
  classId: string,
  selectedClassId: string,
): string {
  const remaining = classesAfterDelete(classes, classId)
  if (remaining.length === 0) return ''
  if (selectedClassId !== classId) {
    return remaining.some(c => c.id === selectedClassId) ? selectedClassId : remaining[0].id
  }
  return remaining[0].id
}

export function canAddClass(classes: AppClass[]): boolean {
  return classes.length < 6
}

export function studentsByClassAfterDelete<T>(
  studentsByClass: Record<string, T>,
  classId: string,
): Record<string, T> {
  const next = { ...studentsByClass }
  delete next[classId]
  return next
}
