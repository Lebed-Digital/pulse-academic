import { useState, useCallback } from 'react'
import type { TrackerScreenProps, AppStudent } from '../types'
import type { DemoLesson } from '../lib/demo'
import type { DayLesson } from '../lib/groq'

export default function TrackerScreen(props: TrackerScreenProps) {
  const {
    activeLesson, isDemo, handleSuggestExitTicket, exitTicketLoading, setActiveLesson, setLessonInput, setExitTickets, setActiveExitTicket, setShowExitTickets,
    activeSubject, savedPlan, setLessonInputExternal, startLessonByTitle, formatDate, lessonInput, startLesson, DEMO_LESSONS, selectedClassId,
    showExitTickets, activeExitTicket, exitTickets, currentStudents, loading, studentStatuses, formatStudentName, nameFormat, STATUS_INITIAL_BG, STATUS_RING, STATUS_CARD, tap, confirmAllGotIt,
    openProfile, checkinNotes, atRiskStudentIds, onCirclePointerDown, onCirclePointerUp, onCirclePointerCancel, showSkills, onGoToPlan,
    todayFlaggedCount, goToTodayGroups,
  } = props

  const [savedFlash, setSavedFlash] = useState(false)
  const handleConfirmAllGotIt = useCallback(() => {
    confirmAllGotIt()
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }, [confirmAllGotIt])

  return (
    <>
      {/* Lesson bar */}
      <div className="sticky top-0 z-10 px-4 py-4 shadow-sm" style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {activeLesson ? (
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 min-w-0">
              <p className="text-xs leading-none mb-0.5" style={{ color: '#5a5a6a' }}>Today's lesson</p>
              <p className="text-sm font-semibold truncate" style={{ color: '#f0f0f2' }}>{activeLesson.title}</p>
            </div>
            {!isDemo && (
              <button type="button" onClick={handleSuggestExitTicket} disabled={exitTicketLoading} className="text-xs font-semibold text-amber-400 hover:text-amber-300 shrink-0 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(251,191,36,0.1)' }}>
                {exitTicketLoading ? '…' : '💡 Exit Ticket'}
              </button>
            )}
            <button type="button" onClick={() => { setActiveLesson(null); setLessonInput(''); setExitTickets([]); setActiveExitTicket(null); setShowExitTickets(false) }} className="text-xs shrink-0" style={{ color: '#5a5a6a' }}>
              Change
            </button>
          </div>
        ) : (() => {
          const planLessons = activeSubject && savedPlan
            ? Object.entries(savedPlan.schedule)
                .sort(([a], [b]) => a.localeCompare(b))
                .flatMap(([date, day]: [string, Record<string, DayLesson>]) => {
                  const activeSubjectLower = activeSubject.toLowerCase()
                  const matchKey = Object.keys(day).find(k => k.toLowerCase() === activeSubjectLower)
                  return matchKey ? [{ date, title: day[matchKey].title }] : []
                })
            : []
          return planLessons.length > 0 ? (
            <div className="w-full max-w-2xl mx-auto">
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#5a5a6a' }}>Pick a lesson</p>
              <div className="flex flex-col gap-2">
                {planLessons.map(({ date, title }) => (
                  <button key={date} type="button"
                    onClick={() => { setLessonInputExternal(title); startLessonByTitle(title, date) }}
                    className="group text-left px-4 py-3 rounded-2xl text-sm font-semibold flex items-center justify-between gap-4 transition-colors hover:bg-teal-900/30"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: '#f0f0f2' }}
                  >
                    <span className="leading-snug">{title}</span>
                    <span className="text-xs font-semibold shrink-0 group-hover:text-teal-400" style={{ color: '#5a5a6a' }}>{formatDate(date)}</span>
                  </button>
                ))}
                <div className="flex gap-2 mt-2">
                  <input type="text" value={lessonInput} onChange={e => setLessonInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && startLesson()} placeholder="Or type a custom lesson…" className="flex-1 min-w-0 text-sm rounded-2xl px-4 py-3 outline-none border focus:border-teal-500 shadow-sm" style={{ background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }} />
                  <button type="button" onClick={startLesson} disabled={!lessonInput.trim()} className="px-5 py-3 bg-teal-500 text-white text-sm font-semibold rounded-2xl disabled:opacity-40 shrink-0 shadow-sm shadow-teal-500/20">Start</button>
                </div>
              </div>
            </div>
          ) : isDemo ? (
            <div className="w-full max-w-2xl mx-auto">
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#5a5a6a' }}>Pick a demo lesson</p>
              <div className="flex flex-col gap-2">
                {DEMO_LESSONS.filter((l: DemoLesson) => l.class_id === selectedClassId).map((l: DemoLesson) => (
                  <button key={l.id} type="button"
                    onClick={() => { setLessonInputExternal(l.title); startLessonByTitle(l.title, l.date) }}
                    className="group text-left px-4 py-3 rounded-2xl text-sm font-semibold flex items-center justify-between gap-4 transition-colors hover:bg-teal-900/30"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: '#f0f0f2' }}
                  >
                    <span className="leading-snug">{l.title}</span>
                    <span className="text-xs font-semibold shrink-0 group-hover:text-teal-400" style={{ color: '#5a5a6a' }}>{formatDate(l.date)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-2xl mx-auto">
              <div className="mb-3 px-1">
                <p className="text-xs font-semibold" style={{ color: '#5a5a6a' }}>
                  No lesson plan uploaded for this week.{' '}
                  <button type="button" onClick={onGoToPlan} className="underline hover:text-teal-400 transition-colors" style={{ color: '#5a5a6a' }}>
                    Upload one in Plan
                  </button>
                  {' '}to get AI exit tickets and smarter tracking. You can still track below.
                </p>
              </div>
              <div className="flex gap-2">
                <input type="text" value={lessonInput} onChange={e => setLessonInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && startLesson()} placeholder="Name this lesson (optional)" className="flex-1 min-w-0 text-sm rounded-2xl px-4 py-3 outline-none border focus:border-teal-500" style={{ background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }} />
                <button type="button" onClick={startLesson} className="px-5 py-3 bg-teal-500 text-white text-sm font-semibold rounded-2xl shrink-0 shadow-sm shadow-teal-500/20">Start</button>
              </div>
              <p className="text-xs mt-2 px-1" style={{ color: '#3d3d4a' }}>Leave blank and it will be labeled with today's date.</p>
            </div>
          )
        })()}
      </div>

      {/* Exit ticket panel */}
      {showExitTickets && activeLesson && !isDemo && (
        <div className="px-4 py-3" style={{ background: 'rgba(251,191,36,0.07)', borderBottom: '1px solid rgba(251,191,36,0.15)' }}>
          {exitTicketLoading ? (
            <p className="text-xs text-amber-400 text-center">Generating exit tickets…</p>
          ) : activeExitTicket ? (
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-400 mb-1">Active Exit Ticket</p>
                <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{activeExitTicket.title}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8b8b9a' }}>{activeExitTicket.description}</p>
              </div>
              <button type="button" onClick={() => { setActiveExitTicket(null); setShowExitTickets(false) }} className="text-xs shrink-0 mt-0.5" style={{ color: '#5a5a6a' }}>✕</button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-amber-400">Pick an exit ticket:</p>
                <button type="button" onClick={() => setShowExitTickets(false)} className="text-xs" style={{ color: '#5a5a6a' }}>✕</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {exitTickets.map((t, i: number) => (
                  <button key={i} type="button" onClick={() => setActiveExitTicket(t)} className="text-left rounded-xl px-3 py-2.5 hover:bg-amber-900/30 transition-colors" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{t.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8b8b9a' }}>{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Student grid */}
      <main className="flex-1 px-4 py-6">
        {!activeLesson ? (
          <>
          {todayFlaggedCount > 0 && (
            <button
              type="button"
              onClick={goToTodayGroups}
              className="mx-auto mt-4 flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-teal-900/20"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid #14b8a6' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{todayFlaggedCount} student{todayFlaggedCount === 1 ? '' : 's'} flagged today</p>
                <p className="text-xs mt-0.5" style={{ color: '#8b8b9a' }}>Tap to build your small groups for tomorrow.</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-teal-400">View pull list ›</span>
            </button>
          )}
          <div className="mx-auto mt-10 flex min-h-40 max-w-sm flex-col items-center justify-center rounded-3xl px-6 py-10 text-center" style={{ border: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-sm font-semibold" style={{ color: '#8b8b9a' }}>
              {currentStudents.length === 0 ? 'No students in this class yet.' : 'Select a lesson to begin.'}
            </p>
            <p className="mt-1 text-xs" style={{ color: '#5a5a6a' }}>
              {currentStudents.length === 0 ? 'Add students from the roster when you are ready.' : 'Your class check-in grid will appear here.'}
            </p>
          </div>
          </>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <svg className="animate-spin h-6 w-6 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            <p className="text-sm" style={{ color: '#8b8b9a' }}>Loading…</p>
          </div>
        ) : (
          <>
            {activeLesson && currentStudents.length > 0 && (() => {
              const gotIt = currentStudents.filter((s: AppStudent) => studentStatuses[s.id] === 'got-it').length
              const almost = currentStudents.filter((s: AppStudent) => studentStatuses[s.id] === 'almost').length
              const needsHelp = currentStudents.filter((s: AppStudent) => studentStatuses[s.id] === 'needs-help').length
              const absent = currentStudents.filter((s: AppStudent) => studentStatuses[s.id] === 'absent').length
              const unmarked = currentStudents.filter((s: AppStudent) => studentStatuses[s.id] === undefined).length
              return (
                <div className="mb-3">
                  <div className="flex items-center justify-between bg-[#111c14] border border-emerald-900/40 rounded-2xl px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-emerald-400">{gotIt} Got It</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" /><span className="text-yellow-400">{almost} Almost</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-red-400">{needsHelp} Needs Help</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-blue-400">{absent} Absent</span></span>
                      {unmarked > 0 && (
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#5a5a6a' }} /><span style={{ color: '#8b8b9a' }}>{unmarked} Unmarked</span></span>
                      )}
                    </div>
                    {!isDemo && (unmarked > 0 || savedFlash) && (
                      <button type="button" onClick={handleConfirmAllGotIt} className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors shrink-0 ml-2 ${savedFlash ? 'bg-emerald-700/60 text-emerald-300' : 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60'}`}>
                        {savedFlash ? '✓ Saved!' : '✓ Mark rest Got It'}
                      </button>
                    )}
                  </div>
                  {(() => {
                    const dayPlan = savedPlan?.schedule[activeLesson?.date ?? '']
                    const lesson = activeSubject ? dayPlan?.[activeSubject] : (dayPlan ? Object.values(dayPlan).find(l => l.title.trim().toLowerCase() === activeLesson?.title?.trim().toLowerCase()) : undefined)
                    const skills = lesson?.skills?.filter(Boolean) ?? []
                    return (
                      <p className="text-center text-[11px] mt-1.5" style={{ color: '#3a3a4a' }}>
                        {showSkills && skills.length >= 2
                          ? `Hold a student circle to log skills & add a note`
                          : `Hold a student circle to add a note`}
                      </p>
                    )
                  })()}
                </div>
              )
            })()}
          {(() => {
            const atRisk = currentStudents.filter((s: AppStudent) => atRiskStudentIds.has(s.id))
            const rest = currentStudents.filter((s: AppStudent) => !atRiskStudentIds.has(s.id))
            const allNames = currentStudents.map((s: AppStudent) => s.name)
            const renderCard = (student: AppStudent) => {
              const status = studentStatuses[student.id] ?? 'unmarked'
              const initial = student.name.trim()[0].toUpperCase()
              const displayName = formatStudentName(student.name, nameFormat, allNames)
              return (
                <div
                  key={student.id}
                  className={`flex flex-col items-center gap-1.5 rounded-xl py-3 px-1 relative ${STATUS_CARD[status as keyof typeof STATUS_CARD]}`}
                >
                  <button
                    type="button"
                    onClick={() => tap(student.id)}
                    onPointerDown={() => onCirclePointerDown(student.id, student.name)}
                    onPointerUp={() => onCirclePointerUp(student.id, student.name)}
                    onPointerLeave={onCirclePointerCancel}
                    onPointerCancel={onCirclePointerCancel}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold active:scale-95 transition-transform select-none touch-manipulation ${STATUS_INITIAL_BG[status as keyof typeof STATUS_INITIAL_BG]} ${STATUS_RING[status as keyof typeof STATUS_RING]}`}
                  >
                    {initial}
                  </button>
                  {checkinNotes[student.id] && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400" title="Has note" />
                  )}
                  <button
                    type="button"
                    onClick={() => openProfile(student.id, student.name)}
                    className="text-[10px] font-bold text-slate-300 leading-tight text-center px-0.5 truncate w-full hover:text-white transition-colors"
                  >
                    {displayName}
                  </button>
                </div>
              )
            }
            return (
              <>
                {atRisk.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#ef4444' }}>Needs attention</span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(239,68,68,0.2)' }} />
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 mb-3">
                      {atRisk.map(renderCard)}
                    </div>
                  </>
                )}
                {atRisk.length > 0 && rest.length > 0 && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#3a3a4a' }}>Class</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  </div>
                )}
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                  {rest.map(renderCard)}
                </div>
              </>
            )
          })()}
          {todayFlaggedCount > 0 && (
            <button
              type="button"
              onClick={goToTodayGroups}
              className="mx-auto mt-5 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors hover:bg-teal-900/40"
              style={{ background: 'rgba(20,184,166,0.1)', color: '#2dd4bf' }}
            >
              {todayFlaggedCount} flagged today · View pull list ›
            </button>
          )}
          </>
        )}
      </main>
    </>
  )
}
