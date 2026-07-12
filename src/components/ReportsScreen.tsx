import { useState, useRef, useMemo } from 'react'
import type { ReportsScreenProps, AppClass, ReportClass, ReportStudent } from '../types'
import { buildPullGroups, type PullGroup, type PullGroupStudent } from '../lib/groups'
import { suggestMiniLesson, type MiniLesson } from '../lib/groq'

interface ExtraProps extends ReportsScreenProps {
  classLabel: (cls: AppClass) => string
  showSkills: boolean
}

type MiniState = { status: 'loading' } | { status: 'error' } | { status: 'done'; data: MiniLesson }

export default function ReportsScreen(props: ExtraProps) {
  const {
    classes, classLabel, reportClassId, setReportClassId, reportRange, setReportRange, reportCustomStart, setReportCustomStart, reportCustomEnd,
    setReportCustomEnd, reportData, copyReport, reportCopied, showSkills, dismissCheckin, clearLesson, reportView, setReportView, isDemo
  } = props

  // key: `${studentId}|${lessonId}|${skill ?? ''}`
  const [pendingDismiss, setPendingDismiss] = useState<Set<string>>(new Set())
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // pending clear-all: lessonId → timeout
  const [pendingClear, setPendingClear] = useState<Set<string>>(new Set())
  const clearTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  function handleClearLesson(lessonId: string) {
    setPendingClear(cur => new Set([...cur, lessonId]))
    const t = setTimeout(() => {
      clearLesson(lessonId)
      setPendingClear(cur => { const next = new Set(cur); next.delete(lessonId); return next })
      clearTimerRefs.current.delete(lessonId)
    }, 3000)
    clearTimerRefs.current.set(lessonId, t)
  }

  function handleUndoClear(lessonId: string) {
    const t = clearTimerRefs.current.get(lessonId)
    if (t) { clearTimeout(t); clearTimerRefs.current.delete(lessonId) }
    setPendingClear(cur => { const next = new Set(cur); next.delete(lessonId); return next })
  }

  function dismissKey(studentId: string, lessonId: string, skill: string | null | undefined) {
    return `${studentId}|${lessonId}|${skill ?? ''}`
  }

  function handleDismiss(studentId: string, lessonId: string, skill: string | null | undefined, fromStatus?: string) {
    const key = dismissKey(studentId, lessonId, skill)
    setPendingDismiss(cur => new Set([...cur, key]))
    const t = setTimeout(() => {
      dismissCheckin(studentId, lessonId, skill, fromStatus as import('../types').Status)
      setPendingDismiss(cur => { const next = new Set(cur); next.delete(key); return next })
      timerRefs.current.delete(key)
    }, 3000)
    timerRefs.current.set(key, t)
  }

  function handleUndo(studentId: string, lessonId: string, skill: string | null | undefined) {
    const key = dismissKey(studentId, lessonId, skill)
    const t = timerRefs.current.get(key)
    if (t) { clearTimeout(t); timerRefs.current.delete(key) }
    setPendingDismiss(cur => { const next = new Set(cur); next.delete(key); return next })
  }

  const surface = { background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }
  const inputStyle = { background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }
  const chipBase = { background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }

  // ── Groups view ────────────────────────────────────────────────────────────
  const pullGroups = useMemo(() => buildPullGroups(reportData, showSkills), [reportData, showSkills])

  // pending group dismiss: `${classId}|${group.key}` → timeout
  const [pendingGroups, setPendingGroups] = useState<Set<string>>(new Set())
  const groupTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const [mini, setMini] = useState<Record<string, MiniState>>({})
  const [miniOpen, setMiniOpen] = useState<Set<string>>(new Set())

  function handleGroupDismiss(gid: string, students: PullGroupStudent[]) {
    setPendingGroups(cur => new Set([...cur, gid]))
    const t = setTimeout(() => {
      students.forEach(s => dismissCheckin(s.id, s.lessonId, s.skill, s.status))
      setPendingGroups(cur => { const next = new Set(cur); next.delete(gid); return next })
      groupTimerRefs.current.delete(gid)
    }, 3000)
    groupTimerRefs.current.set(gid, t)
  }

  function handleGroupUndo(gid: string) {
    const t = groupTimerRefs.current.get(gid)
    if (t) { clearTimeout(t); groupTimerRefs.current.delete(gid) }
    setPendingGroups(cur => { const next = new Set(cur); next.delete(gid); return next })
  }

  async function handleMiniLesson(gid: string, g: PullGroup) {
    const cur = mini[gid]
    if (cur?.status === 'loading') return
    if (cur?.status === 'done') {
      setMiniOpen(open => { const next = new Set(open); if (next.has(gid)) next.delete(gid); else next.add(gid); return next })
      return
    }
    setMini(m => ({ ...m, [gid]: { status: 'loading' } }))
    setMiniOpen(open => new Set([...open, gid]))
    try {
      const topic = g.label.replace(/ \(\d+ of \d+\)$/, '')
      const titles = [...new Set(g.students.map(s => s.lessonTitle))]
      const data = await suggestMiniLesson(topic, titles, g.students.length)
      setMini(m => ({ ...m, [gid]: { status: 'done', data } }))
    } catch {
      setMini(m => ({ ...m, [gid]: { status: 'error' } }))
    }
  }

  function renderAbsentSection(cls: ReportClass, heading: string) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
          <p className="text-xs font-bold text-blue-400 uppercase tracking-wide">{heading}</p>
        </div>
        <div className="flex flex-col gap-1">
          {cls.absent.map((s: ReportStudent) => {
            const rows = s.lessons.filter(l => l.status === 'absent')
            return rows.map(l => {
              const key = dismissKey(s.id, l.lessonId, l.skill)
              const isPending = pendingDismiss.has(key)
              return (
                <div key={key} className={`flex items-center justify-between gap-2 pl-4 py-1 transition-opacity ${isPending ? 'opacity-40' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{s.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>{l.title}</p>
                  </div>
                  {isPending ? (
                    <button type="button" onClick={() => handleUndo(s.id, l.lessonId, l.skill)} className="text-xs font-semibold px-2.5 py-1 rounded-xl shrink-0" style={{ background: 'rgba(255,255,255,0.08)', color: '#8b8b9a' }}>
                      Undo
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleDismiss(s.id, l.lessonId, l.skill, 'absent')} className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors" style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }} title="Mark as caught up">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                  )}
                </div>
              )
            })
          })}
        </div>
      </div>
    )
  }

  function renderGroupsCard(cls: ReportClass) {
    const groups = pullGroups.find(c => c.classId === cls.classId)?.groups ?? []
    return (
      <div key={cls.classId} className="rounded-2xl px-4 py-4" style={surface}>
        <p className="text-sm font-bold mb-3" style={{ color: '#f0f0f2' }}>{cls.className}</p>

        {groups.length === 0 && cls.absent.length === 0 && (
          <p className="text-sm" style={{ color: '#5a5a6a' }}>No students flagged for this period.</p>
        )}

        {groups.length > 0 && (
          <div className="flex flex-col gap-2">
            {groups.map(g => {
              const gid = `${cls.classId}|${g.key}`
              const isPending = pendingGroups.has(gid)
              const miniState = mini[gid]
              const isOpen = miniOpen.has(gid)
              return (
                <div key={g.key} className={`rounded-xl px-3 py-3 transition-opacity ${isPending ? 'opacity-40' : ''}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-sm font-semibold mb-2" style={{ color: '#f0f0f2' }}>
                    {g.label} <span className="font-normal" style={{ color: '#5a5a6a' }}>· {g.students.length} student{g.students.length !== 1 ? 's' : ''}</span>
                  </p>
                  <div className="flex flex-col gap-1 mb-2.5">
                    {g.students.map(s => (
                      <div key={s.id} className="flex items-center gap-2 pl-1">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${s.status === 'needs-help' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                        <p className="text-sm" style={{ color: '#f0f0f2' }}>{s.name}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isPending ? (
                      <button type="button" onClick={() => handleGroupUndo(gid)} className="text-xs font-semibold px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)', color: '#8b8b9a' }}>
                        Undo
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => handleGroupDismiss(gid, g.students)} className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                          ✓ Pulled and retaught
                        </button>
                        {!isDemo && (
                          <button type="button" onClick={() => handleMiniLesson(gid, g)} disabled={miniState?.status === 'loading'} className="text-xs font-semibold px-3 py-1.5 rounded-xl text-amber-400 hover:text-amber-300 transition-colors" style={{ background: 'rgba(251,191,36,0.1)' }}>
                            {miniState?.status === 'loading' ? 'Thinking…' : '💡 Mini lesson'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {isOpen && miniState && miniState.status !== 'loading' && (
                    <div className="rounded-xl px-3 py-2.5 mt-2.5" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)' }}>
                      {miniState.status === 'error' ? (
                        <p className="text-xs text-amber-400">Could not load suggestion. Check your connection.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {([['Focus', miniState.data.focus], ['Warm up', miniState.data.warmUp], ['Activity', miniState.data.activity], ['Check', miniState.data.check]] as const).map(([label, text]) => (
                            <div key={label}>
                              <p className="text-xs font-semibold text-amber-400">{label}</p>
                              <p className="text-xs" style={{ color: '#c9c9d1' }}>{text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {cls.absent.length > 0 && (
          <div className={groups.length > 0 ? 'mt-3' : ''}>
            {renderAbsentSection(cls, 'Missed Lessons')}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
      <h2 className="text-base font-bold mb-4" style={{ color: '#f0f0f2' }}>Student Support Report</h2>

      {/* Filters */}
      <div className="rounded-2xl px-4 py-4 mb-4 flex flex-col gap-3" style={surface}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#5a5a6a' }}>Class</p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
            <button type="button" onClick={() => setReportClassId('all')} className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-center" style={reportClassId === 'all' ? { background: '#14b8a6', color: '#fff' } : chipBase}>All classes</button>
            {classes.map((cls: AppClass) => (
              <button key={cls.id} type="button" onClick={() => setReportClassId(cls.id)} className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-center leading-snug" style={reportClassId === cls.id ? { background: '#14b8a6', color: '#fff' } : chipBase}>{classLabel(cls)}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#5a5a6a' }}>Time period</p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
            {([['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['custom', 'Custom range'], ['all', 'All time']] as const).map(([val, label]) => (
              <button key={val} type="button" onClick={() => setReportRange(val)} className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-center leading-snug" style={reportRange === val ? { background: '#14b8a6', color: '#fff' } : chipBase}>{label}</button>
            ))}
          </div>
          {reportRange === 'custom' && (
            <div className="flex flex-col gap-2 mt-2 sm:flex-row">
              <div className="flex-1">
                <p className="text-xs mb-0.5" style={{ color: '#5a5a6a' }}>From</p>
                <input type="date" value={reportCustomStart} onChange={e => setReportCustomStart(e.target.value)} className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500" style={inputStyle} />
              </div>
              <div className="flex-1">
                <p className="text-xs mb-0.5" style={{ color: '#5a5a6a' }}>To</p>
                <input type="date" value={reportCustomEnd} onChange={e => setReportCustomEnd(e.target.value)} className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500" style={inputStyle} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View toggle */}
      <div className="grid grid-cols-2 gap-2 mb-4 sm:flex sm:gap-1.5">
        {([['list', 'List'], ['groups', 'Groups']] as const).map(([val, label]) => (
          <button key={val} type="button" onClick={() => setReportView(val)} className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-center sm:px-5" style={reportView === val ? { background: '#14b8a6', color: '#fff' } : chipBase}>{label}</button>
        ))}
      </div>

      {/* Results */}
      {reportData.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm" style={{ color: '#5a5a6a' }}>No students flagged for this period.</p>
          <p className="text-xs mt-1" style={{ color: '#3a3a4a' }}>Everyone got it, or no data yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 mb-5">
            {reportView === 'groups' ? reportData.map((cls: ReportClass) => renderGroupsCard(cls)) : reportData.map((cls: ReportClass) => {

              return (
                <div key={cls.classId} className="rounded-2xl px-4 py-4" style={surface}>
                  <p className="text-sm font-bold mb-3" style={{ color: '#f0f0f2' }}>{cls.className}</p>

                  {cls.needsSupport.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                        <p className="text-xs font-bold text-red-400 uppercase tracking-wide">Needs Support</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        {cls.needsSupport.map((s: ReportStudent) => {
                          const rows = s.lessons.filter(l => l.status === 'needs-help')
                          return rows.map(l => {
                            const label = (showSkills && l.skill?.trim()) ? l.skill.trim() : l.title
                            const key = dismissKey(s.id, l.lessonId, l.skill)
                            const isPending = pendingDismiss.has(key)
                            return (
                              <div key={key} className={`flex items-center justify-between gap-2 pl-4 py-1 transition-opacity ${isPending ? 'opacity-40' : ''}`}>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{s.name}</p>
                                  <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>{label}</p>
                                </div>
                                {isPending ? (
                                  <button type="button" onClick={() => handleUndo(s.id, l.lessonId, l.skill)} className="text-xs font-semibold px-2.5 py-1 rounded-xl shrink-0" style={{ background: 'rgba(255,255,255,0.08)', color: '#8b8b9a' }}>
                                    Undo
                                  </button>
                                ) : (
                                  <button type="button" onClick={() => handleDismiss(s.id, l.lessonId, l.skill, 'needs-help')} className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }} title="Mark as remediated">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                  </button>
                                )}
                              </div>
                            )
                          })
                        })}
                      </div>
                      {(() => {
                        const lessonCounts = new Map<string, { title: string; count: number }>()
                        cls.needsSupport.forEach(s => s.lessons.filter(l => l.status === 'needs-help').forEach(l => {
                          const e = lessonCounts.get(l.lessonId)
                          lessonCounts.set(l.lessonId, { title: l.title, count: (e?.count ?? 0) + 1 })
                        }))
                        const multi = [...lessonCounts.entries()].filter(([, v]) => v.count >= 2)
                        if (multi.length === 0) return null
                        return (
                          <div className="flex flex-wrap gap-2 mt-2 pl-4">
                            {multi.map(([lessonId, { title }]) => (
                              pendingClear.has(lessonId) ? (
                                <button key={lessonId} type="button" onClick={() => handleUndoClear(lessonId)} className="text-xs px-2.5 py-1 rounded-xl font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: '#8b8b9a' }}>
                                  Undo · {title}
                                </button>
                              ) : (
                                <button key={lessonId} type="button" onClick={() => handleClearLesson(lessonId)} className="text-xs px-2.5 py-1 rounded-xl" style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399' }}>
                                  Clear all · {title}
                                </button>
                              )
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {cls.checkIn.length > 0 && (
                    <div className={cls.absent.length > 0 ? 'mb-3' : ''}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                        <p className="text-xs font-bold text-yellow-400 uppercase tracking-wide">Worth a Check-In</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        {cls.checkIn.map((s: ReportStudent) => {
                          const rows = s.lessons.filter(l => l.status === 'almost')
                          return rows.map(l => {
                            const label = (showSkills && l.skill?.trim()) ? l.skill.trim() : l.title
                            const key = dismissKey(s.id, l.lessonId, l.skill)
                            const isPending = pendingDismiss.has(key)
                            return (
                              <div key={key} className={`flex items-center justify-between gap-2 pl-4 py-1 transition-opacity ${isPending ? 'opacity-40' : ''}`}>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{s.name}</p>
                                  <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>{label}</p>
                                </div>
                                {isPending ? (
                                  <button type="button" onClick={() => handleUndo(s.id, l.lessonId, l.skill)} className="text-xs font-semibold px-2.5 py-1 rounded-xl shrink-0" style={{ background: 'rgba(255,255,255,0.08)', color: '#8b8b9a' }}>
                                    Undo
                                  </button>
                                ) : (
                                  <button type="button" onClick={() => handleDismiss(s.id, l.lessonId, l.skill, 'almost')} className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors" style={{ background: 'rgba(250,204,21,0.12)', color: '#facc15' }} title="Mark as checked in">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                  </button>
                                )}
                              </div>
                            )
                          })
                        })}
                      </div>
                      {(() => {
                        const lessonCounts = new Map<string, { title: string; count: number }>()
                        cls.checkIn.forEach(s => s.lessons.filter(l => l.status === 'almost').forEach(l => {
                          const e = lessonCounts.get(l.lessonId)
                          lessonCounts.set(l.lessonId, { title: l.title, count: (e?.count ?? 0) + 1 })
                        }))
                        const multi = [...lessonCounts.entries()].filter(([, v]) => v.count >= 2)
                        if (multi.length === 0) return null
                        return (
                          <div className="flex flex-wrap gap-2 mt-2 pl-4">
                            {multi.map(([lessonId, { title }]) => (
                              pendingClear.has(lessonId) ? (
                                <button key={lessonId} type="button" onClick={() => handleUndoClear(lessonId)} className="text-xs px-2.5 py-1 rounded-xl font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: '#8b8b9a' }}>
                                  Undo · {title}
                                </button>
                              ) : (
                                <button key={lessonId} type="button" onClick={() => handleClearLesson(lessonId)} className="text-xs px-2.5 py-1 rounded-xl" style={{ background: 'rgba(250,204,21,0.08)', color: '#facc15' }}>
                                  Clear all · {title}
                                </button>
                              )
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {cls.absent.length > 0 && renderAbsentSection(cls, 'Missed Lesson')}
                </div>
              )
            })}
          </div>

          <button type="button" onClick={copyReport} className="w-full py-3 bg-teal-500 text-white text-sm font-semibold rounded-2xl active:scale-95 transition-transform">
            {reportCopied ? '✓ Copied to clipboard' : 'Copy report'}
          </button>
        </>
      )}
    </main>
  )
}
