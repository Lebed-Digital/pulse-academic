import type { HistoryScreenProps, AppClass, AppStudent, HistoryRow, Status } from '../types'

interface ExtraProps extends HistoryScreenProps {
  classLabel: (cls: AppClass) => string
  historyStudents: AppStudent[]
  studentHistoryRows: HistoryRow[]
  formatDate: (iso: string) => string
  STATUS_PILL: Record<Status, string>
  STATUS_LABEL: Record<Status, string>
  filteredHistory: HistoryRow[]
  lessonDetail: HistoryRow[]
  lessonGroups: { lesson_id: string; lesson_title: string; date: string; rows: HistoryRow[] }[]
  openProfile: (id: string, name: string) => void
  showSkills: boolean
}

export default function HistoryScreen(props: ExtraProps) {
  const {
    historyTab, setHistoryTab, setSelectedStudentId, setSelectedLesson, classes, setHistoryClassId, historyClassId, classLabel,
    historyLoading, selectedStudentId, formatStudentName, historyStudents, nameFormat, studentHistoryRows, formatDate, STATUS_PILL, STATUS_LABEL,
    filteredHistory, selectedLesson, lessonDetail, lessonGroups, openProfile, showSkills,
  } = props

  const cardStyle = { background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }

  return (
    <main className="flex-1 flex flex-col">
      <div className="px-4 pt-3 pb-0 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between" style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex gap-0">
          {(['student', 'lesson'] as const).map((tab) => (
            <button key={tab} type="button"
              onClick={() => { setHistoryTab(tab); setSelectedStudentId(null); setSelectedLesson(null) }}
              className={`px-5 py-2 text-sm font-semibold border-b-2 transition-colors capitalize ${historyTab === tab ? 'border-teal-500 text-teal-400' : 'border-transparent'}`}
              style={historyTab !== tab ? { color: '#5a5a6a' } : {}}
            >
              By {tab}
            </button>
          ))}
        </div>
        {classes.length > 1 && (
          <div className="w-full overflow-x-auto scrollbar-none pb-2 sm:w-auto sm:pb-2">
            <div className="flex w-max gap-2 rounded-xl p-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
              {classes.map((cls: AppClass) => (
                <button key={cls.id} type="button"
                  onClick={() => { setHistoryClassId(cls.id); setSelectedStudentId(null); setSelectedLesson(null) }}
                  className={`max-w-[10.5rem] truncate whitespace-nowrap px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${historyClassId === cls.id ? 'bg-teal-500 text-white shadow-sm' : ''}`}
                  style={historyClassId !== cls.id ? { background: 'rgba(255,255,255,0.06)', color: '#8b8b9a' } : {}}
                >
                  {classLabel(cls)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-4 overflow-auto">
        {historyLoading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <svg className="animate-spin h-6 w-6 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            <p className="text-sm" style={{ color: '#8b8b9a' }}>Loading…</p>
          </div>
        ) : historyTab === 'student' ? (
          selectedStudentId ? (
            <div>
              <button type="button" onClick={() => setSelectedStudentId(null)} className="text-sm text-teal-400 mb-3 flex items-center gap-1">← All students</button>
              <h2 className="text-base font-bold mb-3" style={{ color: '#f0f0f2' }}>
                {formatStudentName(historyStudents.find((s: AppStudent) => s.id === selectedStudentId)?.name ?? '', nameFormat, historyStudents.map((s: AppStudent) => s.name))}
              </h2>
              {studentHistoryRows.length === 0 ? (
                <p className="text-sm" style={{ color: '#5a5a6a' }}>No data yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {studentHistoryRows.map((row: HistoryRow, i: number) => (
                    <div key={i} className="rounded-2xl px-4 py-3 flex items-start justify-between gap-3" style={cardStyle}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{row.lesson_title}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>{formatDate(row.date)} · {row.class_name}</p>
                        {showSkills && row.skill?.trim() && (
                          <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(20,184,166,0.12)', color: '#2dd4bf' }}>{row.skill}</span>
                        )}
                        {row.note && <p className="text-xs text-indigo-400 mt-1 italic">{row.note}</p>}
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_PILL[row.status as keyof typeof STATUS_PILL]}`}>{STATUS_LABEL[row.status as keyof typeof STATUS_LABEL]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {historyStudents.map((s: AppStudent) => {
                const rows = filteredHistory.filter((r: HistoryRow) => r.student_id === s.id)
                const needsHelp = rows.filter((r: HistoryRow) => r.status === 'needs-help').length
                const almost = rows.filter((r: HistoryRow) => r.status === 'almost').length
                return (
                  <div key={s.id} className="rounded-2xl px-3 py-3 flex flex-col items-center text-center gap-1" style={cardStyle}>
                    <button type="button" onClick={() => setSelectedStudentId(s.id)} className="w-full flex flex-col items-center gap-1">
                      <p className="text-sm font-semibold leading-tight" style={{ color: '#f0f0f2' }}>{formatStudentName(s.name, nameFormat, historyStudents.map((x: AppStudent) => x.name))}</p>
                      <p className="text-xs" style={{ color: '#5a5a6a' }}>{rows.length} lesson{rows.length !== 1 ? 's' : ''}</p>
                      <div className="flex flex-wrap justify-center gap-1 mt-0.5">
                        {needsHelp > 0 && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400" title="Needs Help">{needsHelp} ⚠</span>}
                        {almost > 0 && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400" title="Almost">{almost} ~</span>}
                      </div>
                    </button>
                    <button type="button" onClick={() => openProfile(s.id, s.name)} className="text-[10px] text-teal-400 font-semibold mt-0.5 hover:text-teal-300">
                      View profile
                    </button>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          selectedLesson ? (
            <div>
              <button type="button" onClick={() => setSelectedLesson(null)} className="text-sm text-teal-400 mb-3 flex items-center gap-1">← All lessons</button>
              <div className="mb-3">
                <h2 className="text-base font-bold" style={{ color: '#f0f0f2' }}>{selectedLesson.lesson_title}</h2>
                <p className="text-xs" style={{ color: '#5a5a6a' }}>{formatDate(selectedLesson.date)}</p>
              </div>
              {lessonDetail.length === 0 ? (
                <p className="text-sm" style={{ color: '#5a5a6a' }}>No data.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {lessonDetail.sort((a: HistoryRow, b: HistoryRow) => a.student_name.localeCompare(b.student_name)).map((row: HistoryRow, i: number) => (
                    <div key={i} className="rounded-2xl px-4 py-3 flex items-start justify-between gap-3" style={cardStyle}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{formatStudentName(row.student_name, nameFormat, historyStudents.map((s: AppStudent) => s.name))}</p>
                          {showSkills && row.skill?.trim() && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(20,184,166,0.12)', color: '#2dd4bf' }}>{row.skill}</span>
                          )}
                        </div>
                        {row.note && <p className="text-xs text-indigo-400 mt-0.5 italic">{row.note}</p>}
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_PILL[row.status as keyof typeof STATUS_PILL]}`}>{STATUS_LABEL[row.status as keyof typeof STATUS_LABEL]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {lessonGroups.length === 0 ? (
                <p className="text-sm text-center mt-10" style={{ color: '#5a5a6a' }}>No history yet.</p>
              ) : lessonGroups.map((g, i: number) => {
                const needsHelp = g.rows.filter((r: HistoryRow) => r.status === 'needs-help').length
                const almost = g.rows.filter((r: HistoryRow) => r.status === 'almost').length
                const gotIt = g.rows.filter((r: HistoryRow) => r.status === 'got-it').length
                return (
                  <button key={i} type="button" onClick={() => setSelectedLesson({ lesson_id: g.lesson_id, lesson_title: g.lesson_title, date: g.date })} className="rounded-2xl px-4 py-3 flex items-center justify-between text-left hover:brightness-110 transition-all" style={cardStyle}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#f0f0f2' }}>{g.lesson_title}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>{formatDate(g.date)} · {g.rows.length} student{g.rows.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end max-w-32">
                      {gotIt > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400" title="Got It">{gotIt} ✓</span>}
                      {almost > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400" title="Almost">{almost} ~</span>}
                      {needsHelp > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-900/40 text-red-400" title="Needs Help">{needsHelp} ✗</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )
        )}
      </div>
    </main>
  )
}
