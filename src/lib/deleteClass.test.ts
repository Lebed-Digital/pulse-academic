import { describe, it, expect, vi } from 'vitest'
import {
  isDeleteConfirmed,
  classesAfterDelete,
  nextSelectedClassId,
  canAddClass,
  studentsByClassAfterDelete,
} from './deleteClass'
import type { AppClass } from '../types'

const cls = (id: string, name: string): AppClass => ({ id, name, subject: 'Math', display_order: 0 })

const math = cls('c1', 'Period 1 Math')
const ela = cls('c2', 'Period 2 ELA')
const sci = cls('c3', 'Period 3 Science')
const three = [math, ela, sci]

/**
 * Mirrors the control flow of rosterDeleteClass in App.tsx: confirmation gate,
 * demo-mode skip, error bail-out, then local state updates.
 */
async function runDelete(opts: {
  classes: AppClass[]
  classId: string
  selectedClassId: string
  typed: string
  isDemo?: boolean
  deleteError?: { message: string } | null
}) {
  const { classes, classId, selectedClassId, typed, isDemo = false, deleteError = null } = opts

  const calls: string[] = []
  const eq = vi.fn(async (col: string, val: string) => {
    calls.push(`eq:${col}=${val}`)
    return { error: deleteError }
  })
  const del = vi.fn(() => ({ eq }))
  const from = vi.fn((table: string) => {
    calls.push(`from:${table}`)
    return { delete: del }
  })
  const supabase = { from, calls }

  const target = classes.find(c => c.id === classId)
  if (!target || !isDeleteConfirmed(typed, target.name)) {
    return { supabase, wrote: false, blocked: 'unconfirmed' as const, classes, selectedClassId, error: '' }
  }

  if (!isDemo) {
    const { error } = await supabase.from('classes').delete().eq('id', classId)
    if (error) {
      return { supabase, wrote: true, blocked: 'error' as const, classes, selectedClassId, error: 'Could not delete the class. Check your connection and try again.' }
    }
  }

  return {
    supabase,
    wrote: !isDemo,
    blocked: null,
    classes: classesAfterDelete(classes, classId),
    selectedClassId: nextSelectedClassId(classes, classId, selectedClassId),
    error: '',
  }
}

describe('isDeleteConfirmed', () => {
  it('requires the exact class name', () => {
    expect(isDeleteConfirmed('Period 1 Math', 'Period 1 Math')).toBe(true)
  })

  it('rejects partial, empty, wrong-case and wrong-class input', () => {
    expect(isDeleteConfirmed('Period 1', 'Period 1 Math')).toBe(false)
    expect(isDeleteConfirmed('', 'Period 1 Math')).toBe(false)
    expect(isDeleteConfirmed('period 1 math', 'Period 1 Math')).toBe(false)
    expect(isDeleteConfirmed('Period 2 ELA', 'Period 1 Math')).toBe(false)
  })

  it('tolerates surrounding whitespace only', () => {
    expect(isDeleteConfirmed('  Period 1 Math  ', 'Period 1 Math')).toBe(true)
  })

  it('never confirms against a blank class name', () => {
    expect(isDeleteConfirmed('', '')).toBe(false)
    expect(isDeleteConfirmed('   ', '   ')).toBe(false)
  })
})

describe('deleting a non-active class', () => {
  it('removes only that class and leaves the active selection alone', async () => {
    const r = await runDelete({ classes: three, classId: 'c2', selectedClassId: 'c1', typed: 'Period 2 ELA' })
    expect(r.classes.map(c => c.id)).toEqual(['c1', 'c3'])
    expect(r.selectedClassId).toBe('c1')
    expect(r.wrote).toBe(true)
    // exactly one scoped delete, against classes only
    expect(r.supabase.calls).toEqual(['from:classes', 'eq:id=c2'])
  })

  it('does not disturb the other classes', () => {
    const remaining = classesAfterDelete(three, 'c2')
    expect(remaining).toContain(math)
    expect(remaining).toContain(sci)
    expect(remaining).not.toContain(ela)
  })

  it('drops only the deleted class from the student map', () => {
    const byClass = { c1: [{ id: 's1' }], c2: [{ id: 's2' }], c3: [{ id: 's3' }] }
    const next = studentsByClassAfterDelete(byClass, 'c2')
    expect(Object.keys(next).sort()).toEqual(['c1', 'c3'])
    expect(next.c1).toEqual([{ id: 's1' }])
  })
})

describe('deleting the active class when other classes exist', () => {
  it('moves the teacher to the first remaining class', async () => {
    const r = await runDelete({ classes: three, classId: 'c1', selectedClassId: 'c1', typed: 'Period 1 Math' })
    expect(r.selectedClassId).toBe('c2')
    expect(r.classes.map(c => c.id)).toEqual(['c2', 'c3'])
  })

  it('never leaves the deleted id selected', () => {
    for (const id of ['c1', 'c2', 'c3']) {
      expect(nextSelectedClassId(three, id, id)).not.toBe(id)
    }
  })

  it('repairs a selection that already pointed at a missing class', () => {
    expect(nextSelectedClassId(three, 'c3', 'gone')).toBe('c1')
  })
})

describe('deleting the final remaining class', () => {
  it('empties the class list and clears the selection', async () => {
    const r = await runDelete({ classes: [math], classId: 'c1', selectedClassId: 'c1', typed: 'Period 1 Math' })
    expect(r.classes).toEqual([])
    expect(r.selectedClassId).toBe('')
  })

  it('returns an empty selection rather than a stale id', () => {
    expect(nextSelectedClassId([math], 'c1', 'c1')).toBe('')
  })
})

describe('6-class cap after deletion', () => {
  const six = Array.from({ length: 6 }, (_, i) => cls(`c${i}`, `Class ${i}`))

  it('blocks adding at six', () => {
    expect(canAddClass(six)).toBe(false)
  })

  it('frees a slot once a class is deleted', () => {
    expect(canAddClass(classesAfterDelete(six, 'c0'))).toBe(true)
    expect(classesAfterDelete(six, 'c0')).toHaveLength(5)
  })
})

describe('demo mode', () => {
  it('updates local state without any destructive supabase write', async () => {
    const r = await runDelete({ classes: three, classId: 'c1', selectedClassId: 'c1', typed: 'Period 1 Math', isDemo: true })
    expect(r.supabase.from).not.toHaveBeenCalled()
    expect(r.wrote).toBe(false)
    expect(r.classes.map(c => c.id)).toEqual(['c2', 'c3'])
    expect(r.selectedClassId).toBe('c2')
  })
})

describe('failure handling', () => {
  it('keeps the class and surfaces an error when supabase fails', async () => {
    const r = await runDelete({
      classes: three,
      classId: 'c1',
      selectedClassId: 'c1',
      typed: 'Period 1 Math',
      deleteError: { message: 'network down' },
    })
    expect(r.blocked).toBe('error')
    expect(r.classes.map(c => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(r.selectedClassId).toBe('c1')
    expect(r.error).not.toBe('')
  })

  it('does not touch supabase at all when the name was never confirmed', async () => {
    const r = await runDelete({ classes: three, classId: 'c1', selectedClassId: 'c1', typed: 'wrong name' })
    expect(r.supabase.from).not.toHaveBeenCalled()
    expect(r.blocked).toBe('unconfirmed')
    expect(r.classes).toHaveLength(3)
  })
})
