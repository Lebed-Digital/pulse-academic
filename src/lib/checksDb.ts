import { supabase } from './supabase'
import type { Check, CheckResult, ClassData, Result } from './checks'

const PAGE = 500
const CHECK_COLUMNS = 'id, class_id, focus, started_at, ended_at, root_check_id, participant_ids'
const RESULT_COLUMNS = 'id, check_id, student_id, result, note'

type Page<T> = { data: T[] | null; error: unknown }

// Keyset paging until an empty page: it never depends on the API's row cap,
// and ordering by the unique id means rows saved mid-load can't be skipped.
async function fetchAllById<T extends { id: string }>(makeQuery: (lastId: string | null) => PromiseLike<Page<T>>): Promise<T[] | null> {
  const rows: T[] = []
  let lastId: string | null = null
  for (;;) {
    const { data, error } = await makeQuery(lastId)
    if (error || !data) return null
    if (data.length === 0) return rows
    rows.push(...data)
    lastId = data[data.length - 1].id
  }
}

type ResultRow = CheckResult & { students: { name: string } | null }

export async function loadClass(classId: string): Promise<ClassData | null> {
  const checks = await fetchAllById<Check>(lastId => {
    let query = supabase.from('checks').select(CHECK_COLUMNS).eq('class_id', classId).order('id').limit(PAGE)
    if (lastId) query = query.gt('id', lastId)
    return query as unknown as PromiseLike<Page<Check>>
  })
  if (!checks) return null

  const rows = await fetchAllById<ResultRow>(lastId => {
    let query = supabase
      .from('check_results')
      .select(`${RESULT_COLUMNS}, students(name), checks!inner(class_id)`)
      .eq('checks.class_id', classId)
      .order('id')
      .limit(PAGE)
    if (lastId) query = query.gt('id', lastId)
    return query as unknown as PromiseLike<Page<ResultRow>>
  })
  if (!rows) return null

  const results = rows.map(r => ({
    id: r.id, check_id: r.check_id, student_id: r.student_id, result: r.result, note: r.note,
    student_name: r.students?.name,
  }))
  return { checks, results }
}

export async function createCheck(
  userId: string,
  input: { classId: string; focus: string | null; participantIds: string[]; rootCheckId: string | null },
): Promise<Check | null> {
  const { data, error } = await supabase
    .from('checks')
    .insert({
      user_id: userId,
      class_id: input.classId,
      focus: input.focus,
      participant_ids: input.participantIds,
      root_check_id: input.rootCheckId,
    })
    .select(CHECK_COLUMNS)
    .single()
  return error ? null : (data as Check)
}

// Sends only the fields the teacher changed. The merge updates only the columns
// in the payload, so a note save can't touch the result and vice versa.
export async function saveResult(
  userId: string,
  checkId: string,
  studentId: string,
  fields: { result?: Result | null; note?: string | null },
): Promise<CheckResult | null> {
  const { data, error } = await supabase
    .from('check_results')
    .upsert({ user_id: userId, check_id: checkId, student_id: studentId, ...fields }, { onConflict: 'check_id,student_id' })
    .select(RESULT_COLUMNS)
    .single()
  return error ? null : (data as CheckResult)
}

// Two writes that can only fill students who are still unmarked, even if another
// device saved a result after this screen loaded. Returns false if either failed.
export async function markRemaining(userId: string, checkId: string, noRowIds: string[], noteOnlyIds: string[]): Promise<boolean> {
  let ok = true
  if (noRowIds.length > 0) {
    const { error } = await supabase
      .from('check_results')
      .upsert(
        noRowIds.map(studentId => ({ user_id: userId, check_id: checkId, student_id: studentId, result: 'got-it' })),
        { onConflict: 'check_id,student_id', ignoreDuplicates: true },
      )
    if (error) ok = false
  }
  if (noteOnlyIds.length > 0) {
    const { error } = await supabase
      .from('check_results')
      .update({ result: 'got-it' })
      .eq('check_id', checkId)
      .in('student_id', noteOnlyIds)
      .is('result', null)
    if (error) ok = false
  }
  return ok
}

// Both return null when no row changed: the check was already ended (RLS makes
// ended checks read-only), or the request failed. Callers reload the class.
export async function updateFocus(checkId: string, focus: string | null): Promise<Check | null> {
  const { data, error } = await supabase.from('checks').update({ focus }).eq('id', checkId).select(CHECK_COLUMNS).maybeSingle()
  return error ? null : (data as Check | null)
}

export async function endCheck(checkId: string): Promise<Check | null> {
  const { data, error } = await supabase
    .from('checks')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', checkId)
    .select(CHECK_COLUMNS)
    .maybeSingle()
  return error ? null : (data as Check | null)
}
