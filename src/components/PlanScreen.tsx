import type { PlanScreenProps } from '../types'
import type { WeekSchedule, DayLesson } from '../lib/groq'

interface ExtraProps extends PlanScreenProps {
  formatWeek: (weekStart: string) => string
  weekStart: string
  nextWeekStart: string
  planViewWeek: 'current' | 'next'
  setPlanViewWeek: (w: 'current' | 'next') => void
  subjectChoices: string[]
  confirmSubjects: () => void
  DAYS: string[]
  getDateForDayOffset: (offset: number) => string
  today: string
  saveEdit: () => void
  handleSwap: (dateISO: string) => void
  startEdit: (dateISO: string, subject: string) => void
  handleSwapSubject: (dateISO: string, subject: string) => void
  copyToNext: (dateISO: string) => void
  skipSubject: (dateISO: string, subject: string, pushRemaining: boolean) => void
  skipDay: (dateISO: string, pushRemaining: boolean) => void
  handleSavePlan: () => void
  handleUndo: () => void
  // Subject mapping
  unmappedSubjects: string[]
  pendingMappings: Record<string, string>
  setPendingMappings: (m: Record<string, string>) => void
  confirmMappings: () => void
  classes: import('../types').AppClass[]
}

export default function PlanScreen(props: ExtraProps) {
  const {
    formatWeek, weekStart, nextWeekStart, planViewWeek, setPlanViewWeek, pendingSchedule, subjectChoices, setSubjectChoices, confirmSubjects, planSaving, setPendingSchedule,
    savedPlan, undoSnapshot, handleUndo, swapSource, setSwapSource, swapSubjectSource, setSwapSubjectSource, DAYS, getDateForDayOffset,
    today, expandedDay, editingDay, editDraft, editSubject, setEditDraft, saveEdit, setEditingDay, setEditSubject, handleSwap, startEdit,
    setExpandedDay, handleSwapSubject, skipConfirmSubject, setSkipConfirmSubject, skipSubject, copyToNext, skipConfirmDay, setSkipConfirmDay,
    skipDay, setSavedPlan, fileInputRef, handleFileUpload, planText, setPlanText, planError, handleSavePlan, planLoading, planSaved,
    unmappedSubjects, pendingMappings, setPendingMappings, confirmMappings, classes,
  } = props

  const classSubjects = [...new Set(classes.map(c => c.subject).filter(Boolean))].sort()

  const surface = { background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }
  const inputStyle = { background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }

  return (
    <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
      <h2 className="text-base font-bold mb-3" style={{ color: '#f0f0f2' }}>Weekly Lesson Plan</h2>

      {/* Week toggle */}
      {!pendingSchedule && (
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setPlanViewWeek('current'); setSavedPlan(null) }}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={planViewWeek === 'current' ? { background: '#14b8a6', color: '#fff' } : { background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}
          >
            This week
            <span className="block text-[10px] font-normal mt-0.5 opacity-75">{formatWeek(weekStart)}</span>
          </button>
          <button
            type="button"
            onClick={() => { setPlanViewWeek('next'); setSavedPlan(null) }}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={planViewWeek === 'next' ? { background: '#14b8a6', color: '#fff' } : { background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}
          >
            Next week
            <span className="block text-[10px] font-normal mt-0.5 opacity-75">{formatWeek(nextWeekStart)}</span>
          </button>
        </div>
      )}

      {/* ── Mapping step: AI found subjects that don't match class subjects ── */}
      {pendingSchedule && unmappedSubjects.length > 0 && (
        <div className="rounded-2xl px-4 py-4 mb-4" style={surface}>
          <p className="text-sm font-semibold mb-1" style={{ color: '#f0f0f2' }}>Match subjects to your classes</p>
          <p className="text-xs mb-4" style={{ color: '#5a5a6a' }}>
            The AI found subjects that don't exactly match your class names. Tell it which class each one belongs to. This is saved for future uploads.
          </p>
          <div className="flex flex-col gap-3 mb-4">
            {unmappedSubjects.map(planSubj => (
              <div key={planSubj} className="flex items-center gap-3">
                <span className="text-sm font-semibold w-24 shrink-0" style={{ color: '#f0f0f2' }}>{planSubj}</span>
                <span className="text-xs shrink-0" style={{ color: '#5a5a6a' }}>→</span>
                <select
                  value={pendingMappings[planSubj] ?? classSubjects[0] ?? ''}
                  onChange={e => setPendingMappings({ ...pendingMappings, [planSubj]: e.target.value })}
                  className="flex-1 text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500"
                  style={{ background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }}
                >
                  {classSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value={planSubj}>Keep as "{planSubj}" (not matched)</option>
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={confirmMappings} className="flex-1 py-2.5 bg-teal-500 text-white text-sm font-semibold rounded-2xl">
              Confirm matches
            </button>
            <button type="button" onClick={() => { setPendingSchedule(null); setSubjectChoices([]) }} className="px-4 py-2.5 text-sm font-semibold rounded-2xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
          </div>
        </div>
      )}

      {pendingSchedule && unmappedSubjects.length === 0 && (
        <div className="rounded-2xl px-4 py-4 mb-4" style={surface}>
          <p className="text-sm font-semibold mb-1" style={{ color: '#f0f0f2' }}>Which subjects do you want to track?</p>
          <p className="text-xs mb-4" style={{ color: '#5a5a6a' }}>Uncheck any subjects you don't grade (e.g. Health, PE).</p>
          <div className="flex flex-col gap-2 mb-4">
            {(() => {
              const found = new Set<string>()
              for (const day of Object.values(pendingSchedule as WeekSchedule)) for (const subj of Object.keys(day)) found.add(subj)
              return [...found].sort().map(subj => (
                <label key={subj} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={subjectChoices.includes(subj)}
                    onChange={e => setSubjectChoices(e.target.checked ? [...subjectChoices, subj] : subjectChoices.filter((s: string) => s !== subj))}
                    className="w-4 h-4 accent-teal-500"
                  />
                  <span className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{subj}</span>
                </label>
              ))
            })()}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={confirmSubjects} disabled={subjectChoices.length === 0 || planSaving} className="flex-1 py-2.5 bg-teal-500 text-white text-sm font-semibold rounded-2xl disabled:opacity-40">
              {planSaving ? 'Saving…' : `Save with ${subjectChoices.length} subject${subjectChoices.length !== 1 ? 's' : ''}`}
            </button>
            <button type="button" onClick={() => { setPendingSchedule(null); setSubjectChoices([]) }} className="px-4 py-2.5 text-sm font-semibold rounded-2xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
          </div>
        </div>
      )}

      {savedPlan && !pendingSchedule ? (
        <div className="rounded-2xl px-4 py-3 mb-5" style={surface}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-teal-400 uppercase tracking-wide">{planViewWeek === 'next' ? "Next week's schedule" : "This week's schedule"}</p>
            <div className="flex items-center gap-3">
              {undoSnapshot && !planSaving && (
                <button type="button" onClick={handleUndo} className="text-xs font-semibold text-teal-400 underline">↩ Undo</button>
              )}
              {swapSource && <p className="text-xs text-amber-400 font-semibold">Tap another day to swap — <button type="button" onClick={() => setSwapSource(null)} className="underline">cancel</button></p>}
              {swapSubjectSource && <p className="text-xs text-amber-400 font-semibold">Tap another day to swap <strong>{swapSubjectSource.subject}</strong> — <button type="button" onClick={() => setSwapSubjectSource(null)} className="underline">cancel</button></p>}
              {planSaving && <p className="text-xs" style={{ color: '#5a5a6a' }}>Saving…</p>}
            </div>
          </div>
          {DAYS.map((dayName: string, i: number) => {
            const dateISO = getDateForDayOffset(i)
            const dayLessons = savedPlan.schedule[dateISO] ?? {}
            const isToday = dateISO === today
            const isExpanded = expandedDay === dateISO || (expandedDay === null && isToday)
            const isEditing = editingDay === dateISO
            const isSwapSource = swapSource === dateISO
            const subjects = savedPlan.trackedSubjects.filter((s: string) => dayLessons[s])

            if (isEditing && editDraft && editSubject) {
              return (
                <div key={dayName} className="py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-xs font-semibold text-teal-400 mb-0.5">{dayName}</p>
                  <p className="text-xs mb-2" style={{ color: '#5a5a6a' }}>{editSubject}</p>
                  <div className="flex flex-col gap-2">
                    {(['title', 'objective', 'activities', 'assessment'] as (keyof DayLesson)[]).filter(f => f !== 'subject').map(field => (
                      <div key={field}>
                        <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: '#5a5a6a' }}>{field}</p>
                        {field !== 'title' ? (
                          <textarea value={editDraft[field] as string} onChange={e => setEditDraft({ ...editDraft, [field]: e.target.value })} rows={2} className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500 resize-none" style={inputStyle} />
                        ) : (
                          <input type="text" value={editDraft[field] as string} onChange={e => setEditDraft({ ...editDraft, [field]: e.target.value })} className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500" style={inputStyle} />
                        )}
                      </div>
                    ))}
                    <div>
                      <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: '#5a5a6a' }}>Skills <span className="normal-case" style={{ color: '#3a3a4a' }}>(comma-separated)</span></p>
                      <input
                        type="text"
                        value={(editDraft.skills ?? []).join(', ')}
                        onChange={e => setEditDraft({ ...editDraft, skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        placeholder="e.g. Adding fractions, Mixed numbers"
                        className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={saveEdit} className="px-4 py-1.5 bg-teal-500 text-white text-xs font-semibold rounded-xl">Save</button>
                    <button type="button" onClick={() => { setEditingDay(null); setEditSubject(null); setEditDraft(null) }} className="px-4 py-1.5 text-xs font-semibold rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
                  </div>
                </div>
              )
            }

            const isSubjectSwapTarget = swapSubjectSource !== null && swapSubjectSource.dateISO !== dateISO

            return (
              <div
                key={dayName}
                className="last:border-0"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background: isToday ? 'rgba(20,184,166,0.06)' : isSwapSource ? 'rgba(251,191,36,0.06)' : isSubjectSwapTarget ? 'rgba(251,191,36,0.06)' : undefined,
                  marginLeft: (isToday || isSwapSource || isSubjectSwapTarget) ? '-1rem' : undefined,
                  marginRight: (isToday || isSwapSource || isSubjectSwapTarget) ? '-1rem' : undefined,
                  paddingLeft: (isToday || isSwapSource || isSubjectSwapTarget) ? '1rem' : undefined,
                  paddingRight: (isToday || isSwapSource || isSubjectSwapTarget) ? '1rem' : undefined,
                }}
              >
                <button type="button" onClick={() => { if (swapSource) { handleSwap(dateISO); return } if (!swapSubjectSource) setExpandedDay(isExpanded ? null : dateISO) }} className="flex items-start gap-3 py-2.5 w-full text-left">
                  <span className="text-xs font-semibold w-10 shrink-0 mt-0.5" style={{ color: isToday ? '#2dd4bf' : isSwapSource ? '#fbbf24' : '#5a5a6a' }}>{dayName.slice(0, 3)}</span>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    {subjects.length > 0 ? subjects.map((subj: string) => {
                      const isSwapSubjSrc = swapSubjectSource?.dateISO === dateISO && swapSubjectSource?.subject === subj
                      return (
                        <div key={subj} className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold w-14 shrink-0" style={{ color: '#5a5a6a' }}>{subj}</span>
                          <span className="text-sm font-semibold truncate" style={{ color: '#f0f0f2' }}>{dayLessons[subj].title}</span>
          {!swapSource && !swapSubjectSource && <span className="shrink-0 text-xs" style={{ color: '#3a3a4a' }}>✏️</span>}
                          {isSwapSubjSrc && <span className="text-xs text-amber-400 font-semibold shrink-0">← swapping</span>}
                          {isSubjectSwapTarget && swapSubjectSource?.subject === subj && (
                            <button type="button" onClick={e => { e.stopPropagation(); handleSwapSubject(dateISO, subj) }} className="text-xs font-semibold text-amber-400 underline shrink-0">swap here</button>
                          )}
                        </div>
                      )
                    }) : <span className="italic text-sm" style={{ color: '#3a3a4a' }}>No lesson</span>}
                  </div>
                  {!swapSource && !swapSubjectSource && <span className="text-xs mt-0.5" style={{ color: '#3a3a4a' }}>{isExpanded ? '▲' : '▼'}</span>}
                </button>
                {isExpanded && !swapSource && !swapSubjectSource && (
                  <div className="pb-3 flex flex-col gap-4" style={{ paddingLeft: '3.25rem' }}>
                    {subjects.map((subj: string) => {
                      const lesson = dayLessons[subj]
                      const isSkippingThisSubj = skipConfirmSubject?.dateISO === dateISO && skipConfirmSubject?.subject === subj
                      return (
                        <div key={subj}>
                          <p className="text-xs font-bold text-teal-400 mb-1.5">{subj}</p>
                          <div className="flex flex-col gap-1.5">
                            {(['objective', 'activities', 'assessment'] as const).map(f => (
                              <div key={f}>
                                <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#5a5a6a' }}>{f}</p>
                                <p className="text-sm" style={{ color: '#c0c0cc' }}>{lesson[f]}</p>
                              </div>
                            ))}
                            {lesson.skills && lesson.skills.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#5a5a6a' }}>Skills</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {lesson.skills.map(skill => (
                                    <span key={skill} className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(20,184,166,0.12)', color: '#2dd4bf' }}>{skill}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {(!lesson.skills || lesson.skills.length === 0) && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#5a5a6a' }}>Skills</p>
                                <p className="text-xs italic" style={{ color: '#3a3a4a' }}>None extracted — edit to add skills manually</p>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button type="button" onClick={() => startEdit(dateISO, subj)} className="text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-teal-900/30 transition-colors" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>✏️ Edit</button>
                            <button type="button" onClick={() => { setExpandedDay(null); handleSwapSubject(dateISO, subj) }} className="text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-amber-900/30 transition-colors" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>⇄ Swap {subj}</button>
                            {!isSkippingThisSubj && (
                              <button type="button" onClick={() => setSkipConfirmSubject({ dateISO, subject: subj })} className="text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-red-900/30 text-red-400 transition-colors" style={{ background: 'rgba(255,255,255,0.07)' }}>✕ Skip {subj}</button>
                            )}
                            {isSkippingThisSubj && (
                              <div className="flex flex-col gap-1.5 w-full mt-1">
                                <p className="text-xs font-semibold" style={{ color: '#8b8b9a' }}>Skip {subj} how?</p>
                                <button type="button" onClick={() => skipSubject(dateISO, subj, false)} className="text-xs font-semibold px-3 py-1.5 rounded-xl text-left text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>✕ Just remove {subj} this day</button>
                                <button type="button" onClick={() => skipSubject(dateISO, subj, true)} className="text-xs font-semibold px-3 py-1.5 rounded-xl text-left text-amber-400" style={{ background: 'rgba(251,191,36,0.1)' }}>⇩ Remove and push {subj} lessons back</button>
                                <button type="button" onClick={() => setSkipConfirmSubject(null)} className="text-xs px-1" style={{ color: '#5a5a6a' }}>cancel</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      <button type="button" onClick={() => handleSwap(dateISO)} className="text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-amber-900/30 transition-colors" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>⇄ Swap entire day</button>
                      {subjects.length > 0 && <button type="button" onClick={() => copyToNext(dateISO)} className="text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-blue-900/30 transition-colors" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>→ Copy to next day</button>}
                      {subjects.length > 0 && skipConfirmDay !== dateISO && (
                        <button type="button" onClick={() => setSkipConfirmDay(dateISO)} className="text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-red-900/30 text-red-400 transition-colors" style={{ background: 'rgba(255,255,255,0.07)' }}>✕ Skip entire day</button>
                      )}
                      {subjects.length > 0 && skipConfirmDay === dateISO && (
                        <div className="flex flex-col gap-1.5 w-full mt-1">
                          <p className="text-xs font-semibold" style={{ color: '#8b8b9a' }}>Skip entire day how?</p>
                          <button type="button" onClick={() => skipDay(dateISO, false)} className="text-xs font-semibold px-3 py-1.5 rounded-xl text-left text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>✕ Just remove this day</button>
                          <button type="button" onClick={() => skipDay(dateISO, true)} className="text-xs font-semibold px-3 py-1.5 rounded-xl text-left text-amber-400" style={{ background: 'rgba(251,191,36,0.1)' }}>⇩ Remove and push remaining days back</button>
                          <button type="button" onClick={() => setSkipConfirmDay(null)} className="text-xs px-1" style={{ color: '#5a5a6a' }}>cancel</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <button type="button" onClick={() => { setSavedPlan(null); setExpandedDay(null); setEditingDay(null); setEditSubject(null); setSwapSource(null); setSwapSubjectSource(null); setSkipConfirmSubject(null) }} className="text-xs mt-3 hover:text-teal-400 transition-colors" style={{ color: '#5a5a6a' }}>Upload new plan</button>
        </div>
      ) : !pendingSchedule ? (
        <>
          <div className="rounded-2xl px-4 py-4 mb-4" style={surface}>
            <p className="text-sm font-semibold mb-3" style={{ color: '#f0f0f2' }}>Upload or paste your lesson plan</p>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl py-3 text-sm hover:border-teal-500 hover:text-teal-400 transition-colors mb-3" style={{ border: '2px dashed rgba(255,255,255,0.15)', color: '#8b8b9a' }}>
              📎 Upload PDF, Word, or text file
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={handleFileUpload} />
            <textarea value={planText} onChange={e => setPlanText(e.target.value)} placeholder={"Or paste your lesson plan here…\n\nMonday: Fractions — Adding Unlike Denominators\nTuesday: Fractions — Subtracting\n…"} rows={8} className="w-full text-sm rounded-xl px-4 py-3 outline-none resize-none border focus:border-teal-500" style={{ ...inputStyle, borderColor: 'rgba(255,255,255,0.1)' }} />
            {planError && <p className="text-xs text-red-400 mt-2">{planError}</p>}
          </div>
          <button type="button" onClick={handleSavePlan} disabled={!planText.trim() || planLoading} className="w-full py-3 bg-teal-500 text-white text-sm font-semibold rounded-2xl disabled:opacity-40">
            {planLoading ? 'Analyzing with AI…' : planViewWeek === 'next' ? "Save next week's plan" : "Save this week's plan"}
          </button>
          {planSaved && <p className="text-xs text-emerald-400 text-center mt-3 font-semibold">{planViewWeek === 'next' ? '✓ Next week saved! Switch to this week to start lessons.' : '✓ Plan saved! Today\'s lesson was auto-filled.'}</p>}
        </>
      ) : null}
    </main>
  )
}
