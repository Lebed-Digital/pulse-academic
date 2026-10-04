import { useEffect, useRef, useState } from 'react'
import StudentSheet, { type ResultFields } from './StudentSheet'
import { RecheckSheet, ResultsView, StudentHistorySheet } from './CheckViews'
import {
  MARK_LABEL, MARK_TEXT, checkLabel, defaultFocus, formatCheckDay, formatCheckTime, newestFirst, progressText, remaining,
  studentHistory, summarize, supportFor,
  type Check, type CheckResult, type ClassData, type Mark,
} from '../lib/checks'
import { createCheck, endCheck, loadClass, markRemaining, saveResult, updateFocus } from '../lib/checksDb'
import { getDemoClassData, setDemoClassData } from '../lib/demo'
import { formatStudentName } from '../lib/names'
import type { WeekSchedule } from '../lib/ai'
import type { AppClass, AppStudent, NameFormat } from '../types'

interface Props {
  userId: string
  isDemo: boolean
  cls: AppClass
  students: AppStudent[]
  schedule: WeekSchedule | undefined
  today: string
  nameFormat: NameFormat
  onGoToPlan: () => void
  onGoToRoster: () => void
}

type View = { kind: 'idle' } | { kind: 'recording'; checkId: string } | { kind: 'results'; checkId: string }

const surface = { background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }

const TILE: Record<Mark, { card: string; icon: string }> = {
  'not-checked': { card: 'bg-[#141416] border border-white/10', icon: '' },
  'got-it':      { card: 'bg-[#111c14] border border-emerald-900/60', icon: '✓' },
  'almost':      { card: 'bg-[#1c1a0e] border border-yellow-900/60', icon: '↻' },
  'needs-help':  { card: 'bg-[#1c1010] border border-red-900/60', icon: '!' },
  'absent':      { card: 'bg-[#0f1622] border border-blue-900/60', icon: '⊘' },
}

function localId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export default function Workspace({ userId, isDemo, cls, students, schedule, today, nameFormat, onGoToPlan, onGoToRoster }: Props) {
  const [data, setData] = useState<ClassData | null>(() => (isDemo ? getDemoClassData(cls.id) : null))
  const [loadFailed, setLoadFailed] = useState(false)
  const [view, setView] = useState<View>({ kind: 'idle' })
  const [sheet, setSheet] = useState<{ checkId: string; studentId: string } | null>(null)
  const [recheckRootId, setRecheckRootId] = useState<string | null>(null)
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [confirmMark, setConfirmMark] = useState(false)
  const [focusDraft, setFocusDraft] = useState<string | null>(null)
  const [pickedFocus, setPickedFocus] = useState<string | null>(null)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const tileRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isDemo) return
    let cancelled = false
    loadClass(cls.id).then(loaded => {
      if (cancelled) return
      if (loaded) setData(loaded)
      else setLoadFailed(true)
    })
    return () => { cancelled = true }
  }, [cls.id, isDemo])

  useEffect(() => {
    if (isDemo && data) setDemoClassData(cls.id, data)
  }, [isDemo, data, cls.id])

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

  function flash(text: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ text, error: false })
    noticeTimer.current = setTimeout(() => setNotice(null), 2500)
  }

  function fail(text: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ text, error: true })
  }

  async function reload(): Promise<ClassData | null> {
    if (isDemo) return data
    const loaded = await loadClass(cls.id)
    if (loaded) setData(loaded)
    setLoadFailed(!loaded)
    return loaded
  }

  const checks = data?.checks ?? []
  const results = data?.results ?? []
  const recent = newestFirst(checks)
  const openCheck = recent.find(c => !c.ended_at) ?? null
  const support = supportFor(checks, results)

  const allNames = students.map(s => s.name)
  const displayNames = new Map(students.map(s => [s.id, formatStudentName(s.name, nameFormat, allNames)]))
  const ordered = [...students].sort((a, b) =>
    displayNames.get(a.id)!.localeCompare(displayNames.get(b.id)!) || a.id.localeCompare(b.id))
  const nameOf = (id: string) => displayNames.get(id) ?? null

  const planFocus = defaultFocus(schedule, cls.subject, today)
  const otherFocuses = planFocus
    ? []
    : [...new Set(Object.values(schedule?.[today] ?? {}).map(e => e.focus?.trim() || e.title?.trim()).filter((v): v is string => Boolean(v)))]
  const nextFocus = pickedFocus ?? planFocus

  const viewCheck = view.kind === 'idle' ? null : checks.find(c => c.id === view.checkId) ?? null
  const recording = view.kind === 'recording' && viewCheck !== null && !viewCheck.ended_at

  function supportIdsFor(rootId: string): string[] {
    const group = support.find(g => g.root.id === rootId)
    return group ? group.students.map(s => s.studentId).filter(id => displayNames.has(id)) : []
  }

  async function startCheck(focus: string | null, participantIds: string[], rootCheckId: string | null) {
    if (busy || participantIds.length === 0) return
    setBusy(true)
    setNotice(null)
    const created: Check | null = isDemo
      ? { id: localId(), class_id: cls.id, focus, started_at: new Date().toISOString(), ended_at: null, root_check_id: rootCheckId, participant_ids: participantIds }
      : await createCheck(userId, { classId: cls.id, focus, participantIds, rootCheckId })
    setBusy(false)
    if (!created) {
      fail("Couldn't start the check. Try again.")
      return
    }
    setData(cur => ({ checks: [...(cur?.checks ?? []), created], results: cur?.results ?? [] }))
    setRecheckRootId(null)
    setConfirmNew(false)
    setPickedFocus(null)
    setView({ kind: 'recording', checkId: created.id })
  }

  async function finishCheck(check: Check): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    const ended = isDemo ? { ...check, ended_at: new Date().toISOString() } : await endCheck(check.id)
    if (ended) {
      setData(cur => cur && { ...cur, checks: cur.checks.map(c => (c.id === ended.id ? ended : c)) })
      setBusy(false)
      return true
    }
    // No row changed: it was already ended on another device, or the request failed.
    const loaded = await reload()
    setBusy(false)
    const endedElsewhere = loaded?.checks.some(c => c.id === check.id && c.ended_at) ?? false
    if (!endedElsewhere) fail("Couldn't end the check. Check your connection and try again.")
    return endedElsewhere
  }

  async function doneForNow(check: Check) {
    if (!(await finishCheck(check))) return
    setFocusDraft(null)
    setConfirmMark(false)
    setView({ kind: 'idle' })
  }

  async function endAndStartNew() {
    if (!openCheck || !(await finishCheck(openCheck))) return
    await startCheck(nextFocus, ordered.map(s => s.id), null)
  }

  function closeSheet(studentId: string) {
    setSheet(null)
    tileRefs.current[studentId]?.focus()
  }

  async function saveStudent(checkId: string, studentId: string, fields: ResultFields): Promise<boolean> {
    let saved: CheckResult | null
    if (isDemo) {
      const existing = results.find(r => r.check_id === checkId && r.student_id === studentId)
      saved = {
        id: existing?.id ?? localId(),
        check_id: checkId,
        student_id: studentId,
        result: 'result' in fields ? fields.result ?? null : existing?.result ?? null,
        note: 'note' in fields ? fields.note ?? null : existing?.note ?? null,
      }
    } else {
      saved = await saveResult(userId, checkId, studentId, fields)
    }
    if (!saved) return false
    const row = saved
    setData(cur => cur && {
      ...cur,
      results: [...cur.results.filter(r => !(r.check_id === checkId && r.student_id === studentId)), row],
    })
    closeSheet(studentId)
    flash(`Saved for ${nameOf(studentId) ?? 'student'}`)
    return true
  }

  function remainingInRoster(check: Check) {
    const { noRowIds, noteOnlyIds } = remaining(check, results)
    return { noRowIds: noRowIds.filter(id => displayNames.has(id)), noteOnlyIds: noteOnlyIds.filter(id => displayNames.has(id)) }
  }

  async function markRest(check: Check) {
    if (busy) return
    const { noRowIds, noteOnlyIds } = remainingInRoster(check)
    setConfirmMark(false)
    if (noRowIds.length + noteOnlyIds.length === 0) return
    setBusy(true)
    if (isDemo) {
      setData(cur => cur && {
        ...cur,
        results: [
          ...cur.results.map(r => (r.check_id === check.id && noteOnlyIds.includes(r.student_id) && r.result === null ? { ...r, result: 'got-it' as const } : r)),
          ...noRowIds.map(id => ({ id: localId(), check_id: check.id, student_id: id, result: 'got-it' as const, note: null })),
        ],
      })
      setBusy(false)
      flash('Marked as Got it')
      return
    }
    const ok = await markRemaining(userId, check.id, noRowIds, noteOnlyIds)
    const loaded = await reload()
    setBusy(false)
    if (!loaded) fail("Couldn't confirm what saved. Reload to see the current results.")
    else if (!ok) fail("Couldn't mark everyone. Showing what saved.")
    else flash('Marked as Got it')
  }

  async function saveFocus(check: Check) {
    const focus = focusDraft?.trim() || null
    setFocusDraft(null)
    if (focus === (check.focus?.trim() || null)) return
    const updated = isDemo ? { ...check, focus } : await updateFocus(check.id, focus)
    if (!updated) {
      await reload()
      fail("Couldn't change the focus.")
      return
    }
    setData(cur => cur && { ...cur, checks: cur.checks.map(c => (c.id === updated.id ? updated : c)) })
  }

  function openCheckView(check: Check) {
    setNotice(null)
    setView(check.ended_at ? { kind: 'results', checkId: check.id } : { kind: 'recording', checkId: check.id })
  }

  function recheckTag(check: Check): string {
    return `Recheck · ${check.participant_ids.length} student${check.participant_ids.length === 1 ? '' : 's'}`
  }

  const noticeLine = notice && (
    <p role={notice.error ? 'alert' : 'status'} className="text-xs font-semibold" style={{ color: notice.error ? '#f87171' : '#34d399' }}>{notice.text}</p>
  )

  const loadError = loadFailed && (
    <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
      <p className="text-sm" style={{ color: '#f87171' }}>Couldn't load this class's checks.</p>
      <button type="button" onClick={reload} className="text-xs font-semibold underline shrink-0" style={{ color: '#f87171' }}>Try again</button>
    </div>
  )

  const sheetStudent = sheet ? students.find(s => s.id === sheet.studentId) : undefined
  const sheetCheck = sheet ? checks.find(c => c.id === sheet.checkId) : undefined
  const sheetSaved = sheet ? results.find(r => r.check_id === sheet.checkId && r.student_id === sheet.studentId) : undefined
  const recheckRoot = recheckRootId ? checks.find(c => c.id === recheckRootId) : undefined

  const sheets = (
    <>
      {sheet && sheetStudent && sheetCheck && (
        <StudentSheet
          key={`${sheet.checkId}-${sheet.studentId}`}
          studentName={sheetStudent.name}
          focusLabel={checkLabel(sheetCheck)}
          saved={{ result: sheetSaved?.result ?? null, note: sheetSaved?.note ?? null }}
          onSave={fields => saveStudent(sheet.checkId, sheet.studentId, fields)}
          onClose={() => closeSheet(sheet.studentId)}
        />
      )}
      {recheckRoot && (
        <RecheckSheet
          title={checkLabel(recheckRoot)}
          students={ordered.map(s => ({ id: s.id, name: displayNames.get(s.id)! }))}
          preselected={supportIdsFor(recheckRoot.id)}
          busy={busy}
          onStart={ids => startCheck(recheckRoot.focus, ordered.filter(s => ids.includes(s.id)).map(s => s.id), recheckRoot.id)}
          onClose={() => setRecheckRootId(null)}
        />
      )}
      {historyStudentId && (
        <StudentHistorySheet
          name={students.find(s => s.id === historyStudentId)?.name ?? results.find(r => r.student_id === historyStudentId)?.student_name ?? 'Student'}
          entries={studentHistory(historyStudentId, checks, results)}
          onClose={() => setHistoryStudentId(null)}
        />
      )}
    </>
  )

  if (viewCheck && recording) {
    const { marks, counts } = summarize(viewCheck, results)
    const notes = new Set(results.filter(r => r.check_id === viewCheck.id && r.note).map(r => r.student_id))
    const inGrid = ordered.filter(s => viewCheck.participant_ids.includes(s.id))
    const rest = remainingInRoster(viewCheck)
    const restCount = rest.noRowIds.length + rest.noteOnlyIds.length

    return (
      <>
        <div className="sticky top-0 z-10 px-4 py-3" style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <button type="button" onClick={() => { setFocusDraft(null); setConfirmMark(false); setView({ kind: 'idle' }) }} className="min-w-0 truncate text-xs font-semibold" style={{ color: '#8b8b9a' }}>
              ‹ {cls.name}
            </button>
            <button type="button" onClick={() => doneForNow(viewCheck)} disabled={busy || focusDraft !== null} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.07)', color: '#c0c0cc' }}>
              Done for now
            </button>
          </div>
          {focusDraft === null ? (
            <button type="button" onClick={() => setFocusDraft(viewCheck.focus ?? '')} className="flex w-full items-start gap-2 text-left" aria-label="Edit focus">
              <span className="flex-1 min-w-0 text-sm font-semibold break-words" style={{ color: '#f0f0f2' }}>{checkLabel(viewCheck)}</span>
              <span className="shrink-0 text-xs" style={{ color: '#5a5a6a' }}>Edit</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={focusDraft}
                onChange={e => setFocusDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveFocus(viewCheck); if (e.key === 'Escape') setFocusDraft(null) }}
                placeholder="What are you checking?"
                aria-label="Focus"
                className="flex-1 min-w-0 text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500"
                style={{ background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }}
              />
              <button type="button" onClick={() => saveFocus(viewCheck)} className="px-3 py-2 bg-teal-500 text-white text-xs font-semibold rounded-xl">Save</button>
              <button type="button" onClick={() => setFocusDraft(null)} className="px-2 py-2 text-xs font-semibold" style={{ color: '#8b8b9a' }}>Cancel</button>
            </div>
          )}
          <p className="text-xs mt-1.5" style={{ color: '#8b8b9a' }}>
            {viewCheck.root_check_id ? `${recheckTag(viewCheck)} · ` : ''}{progressText(counts)}
          </p>
          {noticeLine && <div className="mt-1">{noticeLine}</div>}
        </div>

        <main className="flex-1 px-3 py-4">
          {loadError && <div className="mb-3">{loadError}</div>}
          <div className="grid grid-cols-3 min-[360px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {inGrid.map(student => {
              const mark = marks[student.id]
              return (
                <button
                  key={student.id}
                  type="button"
                  ref={el => { tileRefs.current[student.id] = el }}
                  onClick={() => setSheet({ checkId: viewCheck.id, studentId: student.id })}
                  aria-label={`${student.name}, ${MARK_LABEL[mark]}${notes.has(student.id) ? ', has note' : ''}`}
                  className={`relative flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center transition-transform active:scale-[0.97] touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400 ${TILE[mark].card}`}
                >
                  <span className="text-xs font-bold leading-tight line-clamp-2 break-words" style={{ color: '#f0f0f2' }}>{displayNames.get(student.id)}</span>
                  <span className={`text-[10px] font-semibold leading-none ${MARK_TEXT[mark]}`}>
                    {TILE[mark].icon && <span aria-hidden="true">{TILE[mark].icon} </span>}{MARK_LABEL[mark]}
                  </span>
                  {notes.has(student.id) && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400" aria-hidden="true" />}
                </button>
              )
            })}
          </div>

          <div className="mt-5 flex flex-col gap-2 max-w-md mx-auto">
            <button type="button" onClick={() => setView({ kind: 'results', checkId: viewCheck.id })} className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-teal-500">
              View results
            </button>
            {restCount > 0 && !confirmMark && (
              <button type="button" onClick={() => setConfirmMark(true)} disabled={busy} className="w-full py-2.5 rounded-2xl text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.06)', color: '#8b8b9a' }}>
                Mark {restCount} remaining as Got it
              </button>
            )}
            {confirmMark && (
              <div className="rounded-2xl px-4 py-3" style={surface}>
                <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>
                  Mark {restCount} unchecked student{restCount === 1 ? '' : 's'} as Got it?
                </p>
                <p className="text-xs mt-1" style={{ color: '#8b8b9a' }}>Students you already marked stay as they are.</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => setConfirmMark(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
                  <button type="button" onClick={() => markRest(viewCheck)} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-500 disabled:opacity-40">Mark as Got it</button>
                </div>
              </div>
            )}
          </div>
        </main>
        {sheets}
      </>
    )
  }

  if (viewCheck) {
    const rootId = viewCheck.root_check_id ?? viewCheck.id
    return (
      <>
        {(loadError || noticeLine) && <div className="px-4 pt-4 max-w-2xl mx-auto w-full flex flex-col gap-2">{loadError}{noticeLine}</div>}
        <ResultsView
          check={viewCheck}
          results={results}
          nameOf={nameOf}
          recheckCount={supportIdsFor(rootId).length}
          busy={busy}
          onBackToGrid={() => setView({ kind: 'recording', checkId: viewCheck.id })}
          onDone={() => doneForNow(viewCheck)}
          onClose={() => setView({ kind: 'idle' })}
          onRecheck={() => setRecheckRootId(rootId)}
          onOpenStudent={setHistoryStudentId}
        />
        {sheets}
      </>
    )
  }

  return (
    <>
      <main className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full flex flex-col gap-4">
        {loadError}
        {data === null ? (
          !loadFailed && <p className="text-sm text-center py-10" style={{ color: '#8b8b9a' }}>Loading…</p>
        ) : (
          <>
            {students.length === 0 ? (
              <div className="mx-auto w-full flex min-h-40 max-w-sm flex-col items-center justify-center rounded-3xl px-6 py-10 text-center" style={{ border: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                <p className="text-sm font-semibold" style={{ color: '#8b8b9a' }}>No students in this class yet.</p>
                {!isDemo && (
                  <button type="button" onClick={onGoToRoster} className="mt-2 text-sm font-semibold text-teal-400 underline">Add students in Roster</button>
                )}
              </div>
            ) : (
            <section className="rounded-2xl px-4 py-4" style={surface}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5a5a6a' }}>Today's focus</p>
              <p className="text-sm font-semibold mt-1 break-words" style={{ color: nextFocus ? '#f0f0f2' : '#8b8b9a' }}>
                {nextFocus ?? 'No focus set for today. You can name it once the check starts.'}
              </p>
              {otherFocuses.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {otherFocuses.map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPickedFocus(cur => (cur === option ? null : option))}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={pickedFocus === option
                        ? { background: 'rgba(20,184,166,0.18)', color: '#2dd4bf', border: '1px solid rgba(20,184,166,0.5)' }
                        : { background: 'rgba(255,255,255,0.07)', color: '#8b8b9a', border: '1px solid transparent' }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
              {!isDemo && !schedule?.[today] && (
                <button type="button" onClick={onGoToPlan} className="mt-2 text-xs underline" style={{ color: '#5a5a6a' }}>
                  Upload this week's plan to fill this in
                </button>
              )}

              {openCheck ? (
                <div className="mt-4 flex flex-col gap-2">
                  <button type="button" onClick={() => openCheckView(openCheck)} className="w-full py-3.5 rounded-2xl text-left px-4 text-white bg-teal-500 shadow-md shadow-teal-500/20">
                    <span className="block text-sm font-bold">Continue check</span>
                    <span className="block text-xs mt-0.5 opacity-90 break-words">{checkLabel(openCheck)} · started {formatCheckTime(openCheck.started_at)}</span>
                  </button>
                  {confirmNew ? (
                    <div className="rounded-2xl px-4 py-3" style={{ background: '#1e1e22' }}>
                      <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>End the open check and start a new one?</p>
                      <p className="text-xs mt-1" style={{ color: '#8b8b9a' }}>Everything saved in it is kept. Students you didn't check stay Not checked.</p>
                      <div className="flex gap-2 mt-3">
                        <button type="button" onClick={() => setConfirmNew(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
                        <button type="button" onClick={endAndStartNew} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-500 disabled:opacity-40">End it and start new</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmNew(true)} className="w-full py-2.5 rounded-2xl text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: '#8b8b9a' }}>
                      Start a new check
                    </button>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => startCheck(nextFocus, ordered.map(s => s.id), null)} disabled={busy} className="mt-4 w-full py-3.5 rounded-2xl text-sm font-bold text-white bg-teal-500 shadow-md shadow-teal-500/20 disabled:opacity-40">
                  {busy ? 'Starting…' : 'Check understanding'}
                </button>
              )}
              {noticeLine && <div className="mt-2">{noticeLine}</div>}
            </section>
            )}

            {support.some(g => supportIdsFor(g.root.id).length > 0) && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: '#5a5a6a' }}>Who needs you</h2>
                <div className="flex flex-col gap-2">
                  {support.map(group => {
                    const inClass = group.students.filter(s => displayNames.has(s.studentId))
                    if (inClass.length === 0) return null
                    return (
                      <div key={group.root.id} className="rounded-2xl px-4 py-3" style={surface}>
                        <p className="text-sm font-semibold break-words" style={{ color: '#f0f0f2' }}>{checkLabel(group.root)}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>{formatCheckDay(group.root.started_at)}</p>
                        {(['needs-help', 'almost'] as const).map(mark => {
                          const list = inClass.filter(s => s.result === mark)
                          if (list.length === 0) return null
                          return (
                            <div key={mark} className="mt-2">
                              <p className={`text-xs font-bold ${MARK_TEXT[mark]}`}>{MARK_LABEL[mark]}</p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {list.map(s => (
                                  <button key={s.studentId} type="button" onClick={() => setHistoryStudentId(s.studentId)} className="rounded-xl px-3 py-1.5 text-sm font-medium text-left" style={{ background: '#1e1e22', color: '#f0f0f2' }}>
                                    {displayNames.get(s.studentId)}
                                    {s.notHereOn && <span className="block text-[10px]" style={{ color: '#60a5fa' }}>Not here on {formatCheckDay(s.notHereOn)}</span>}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                        <button type="button" onClick={() => setRecheckRootId(group.root.id)} className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(20,184,166,0.12)', color: '#2dd4bf' }}>
                          Recheck
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {recent.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: '#5a5a6a' }}>Recent checks</h2>
                <div className="flex flex-col gap-2">
                  {(showAllRecent ? recent : recent.slice(0, 10)).map(check => (
                    <button key={check.id} type="button" onClick={() => openCheckView(check)} className="rounded-2xl px-4 py-3 text-left" style={surface}>
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0 text-sm font-semibold break-words" style={{ color: '#f0f0f2' }}>{checkLabel(check)}</span>
                        {!check.ended_at && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-teal-400">Open</span>}
                      </span>
                      <span className="block text-xs mt-0.5" style={{ color: '#5a5a6a' }}>
                        {formatCheckTime(check.started_at)}{check.root_check_id ? ` · ${recheckTag(check)}` : ''} · {progressText(summarize(check, results).counts)}
                      </span>
                    </button>
                  ))}
                  {!showAllRecent && recent.length > 10 && (
                    <button type="button" onClick={() => setShowAllRecent(true)} className="py-2 text-xs font-semibold" style={{ color: '#8b8b9a' }}>
                      Show all {recent.length}
                    </button>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>
      {sheets}
    </>
  )
}
