import type { RosterScreenProps, AppClass, AppStudent, NameFormat, Screen } from '../types'

interface ExtraProps extends RosterScreenProps {
  SUBJECTS: string[]
  setScreen: (screen: Screen) => void
  setSelectedStudentId: (id: string | null) => void
  setHistoryClassId: (id: string) => void
  nameFormat: NameFormat
  cycleNameFormat: () => void
  showSkills: boolean
  toggleShowSkills: () => void
}

export default function RosterScreen(props: ExtraProps) {
  const {
    classes, rosterAddingClass, setRosterAddingClass, rosterNewClassName, setRosterNewClassName, rosterAddClass, rosterNewClassSubject,
    setRosterNewClassSubject, SUBJECTS, rosterSaving, studentsByClass, rosterRenaming, rosterRenameValue, setRosterRenameValue, rosterRenameClass,
    setRosterRenaming, rosterConfirmRemove, rosterRemoveStudent, setRosterConfirmRemove, rosterNewStudentName, setRosterNewStudentName,
    rosterAddStudent, setRosterPasteClassId, setRosterPasteText, setRosterCopySourceClassId, setRosterCopyTargetClassId, rosterCopySourceClassId,
    rosterCopyTargetClassId, rosterCopyFromClass, rosterPasteClassId, rosterPasteText, rosterParsing, rosterBulkAdd,
    setScreen, setSelectedStudentId, setHistoryClassId,
    rosterRenamingStudent, setRosterRenamingStudent, rosterStudentRenameValue, setRosterStudentRenameValue, rosterRenameStudent,
    expandedRosterClassId, setExpandedRosterClassId,
    rosterDeletingClass, setRosterDeletingClass, rosterDeleteConfirmText, setRosterDeleteConfirmText,
    rosterDeleteError, rosterDeleteClass, rosterCancelDeleteClass,
    nameFormat, cycleNameFormat, showSkills, toggleShowSkills
  } = props

  const deletingClass = classes.find((c: AppClass) => c.id === rosterDeletingClass) ?? null
  const deleteConfirmed = !!deletingClass && rosterDeleteConfirmText.trim() === deletingClass.name.trim()

  const surface = { background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }
  const inputStyle = { background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }

  return (
    <>
      <main className="flex-1 px-4 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-bold" style={{ color: '#f0f0f2' }}>Roster</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cycleNameFormat}
              title={`Name format: ${nameFormat}`}
              className="shrink-0 text-xs font-semibold px-3 py-2 rounded-xl transition-colors hover:text-teal-400"
              style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}
            >
              {nameFormat === 'full' ? 'Full' : nameFormat === 'first' ? 'First' : 'Init'}
            </button>
            <button
              type="button"
              onClick={toggleShowSkills}
              title="Toggle skill tracking display"
              className="shrink-0 text-xs font-semibold px-3 py-2 rounded-xl transition-colors hover:text-teal-400"
              style={{ background: 'rgba(255,255,255,0.07)', color: showSkills ? '#2dd4bf' : '#8b8b9a' }}
            >
              {showSkills ? 'Skills ✓' : 'Skills off'}
            </button>
            {classes.length < 6 && !rosterAddingClass && (
              <button type="button" onClick={() => setRosterAddingClass(true)} className="shrink-0 text-xs font-semibold text-teal-400 hover:text-teal-300 px-3 py-2 rounded-xl" style={{ background: 'rgba(20,184,166,0.1)' }}>
                + Add class
              </button>
            )}
          </div>
        </div>

        {rosterAddingClass && (
          <div className="rounded-2xl px-4 py-4 mb-4" style={surface}>
            <p className="text-sm font-semibold mb-3" style={{ color: '#f0f0f2' }}>New class</p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={rosterNewClassName}
                onChange={e => setRosterNewClassName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && rosterAddClass()}
                placeholder="Class name (e.g. Period 1)"
                className="text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500"
                style={inputStyle}
              />
              <select
                value={rosterNewClassSubject}
                onChange={e => setRosterNewClassSubject(e.target.value)}
                className="text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500"
                style={inputStyle}
              >
                {SUBJECTS.map((s: string) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={rosterAddClass} disabled={!rosterNewClassName.trim() || rosterSaving} className="px-4 py-2 bg-teal-500 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                {rosterSaving ? 'Saving…' : 'Add'}
              </button>
              <button type="button" onClick={() => { setRosterAddingClass(false); setRosterNewClassName('') }} className="px-4 py-2 text-sm font-semibold rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
            </div>
          </div>
        )}

        {classes.length === 0 && !rosterAddingClass && (
          <div className="mx-auto mt-10 flex min-h-40 max-w-sm flex-col items-center justify-center rounded-3xl px-6 py-10 text-center" style={{ border: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-2xl mb-3">👋</p>
            <p className="text-sm font-semibold" style={{ color: '#8b8b9a' }}>Welcome! Start by creating your first class.</p>
            <p className="mt-1 text-xs" style={{ color: '#5a5a6a' }}>Tap "+ Add class" above to get started.</p>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          {classes.map((cls: AppClass) => {
            const students = [...(studentsByClass[cls.id] ?? [])].sort((a: AppStudent, b: AppStudent) => a.name.localeCompare(b.name))
            const isRenaming = rosterRenaming === cls.id
            const isExpanded = expandedRosterClassId === cls.id

            return (
              <div key={cls.id} className="rounded-2xl overflow-hidden flex flex-col h-fit" style={surface}>
                <button
                  type="button"
                  onClick={() => setExpandedRosterClassId(isExpanded ? null : cls.id)}
                  className="w-full text-left focus:outline-none"
                >
                  <div className="px-4 py-4 flex items-center justify-between transition-colors" style={isExpanded ? { background: 'rgba(255,255,255,0.04)' } : {}}>
                    {isRenaming ? (
                      <div className="flex gap-2 flex-1" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={rosterRenameValue}
                          onChange={e => setRosterRenameValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && rosterRenameClass(cls.id)}
                          autoFocus
                          className="flex-1 text-sm rounded-xl px-3 py-1.5 outline-none border focus:border-teal-500 font-semibold"
                          style={inputStyle}
                        />
                        <button type="button" onClick={() => rosterRenameClass(cls.id)} disabled={rosterSaving} className="px-3 py-1.5 bg-teal-500 text-white text-xs font-semibold rounded-xl disabled:opacity-40">Save</button>
                        <button type="button" onClick={() => setRosterRenaming(null)} className="px-3 py-1.5 text-xs font-semibold rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate" style={{ color: '#f0f0f2' }}>{cls.name}</p>
                          <p className="text-xs" style={{ color: '#5a5a6a' }}>{cls.subject} · {students.length} student{students.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setRosterRenaming(cls.id); setRosterRenameValue(cls.name) }}
                            className="text-[10px] font-bold uppercase tracking-wider hover:text-teal-400 transition-colors"
                            style={{ color: '#5a5a6a' }}
                          >
                            Rename
                          </button>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3a3a4a' }}>{isExpanded ? 'Hide' : 'View'}</span>
                            <span className={`text-[10px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} style={{ color: '#3a3a4a' }}>▼</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-5 pt-2 animate-in fade-in slide-in-from-top-1 duration-200" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {students.length === 0 && <p className="text-xs italic col-span-2" style={{ color: '#3a3a4a' }}>No students yet.</p>}
                      {students.map((s: AppStudent) => (
                        <div key={s.id} className="flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: '#1e1e22' }}>
                          {rosterRenamingStudent === s.id ? (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <input
                                type="text"
                                value={rosterStudentRenameValue}
                                onChange={e => setRosterStudentRenameValue(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && rosterRenameStudent(s.id)}
                                autoFocus
                                className="flex-1 min-w-0 text-sm rounded-lg px-2 py-1 outline-none border focus:border-teal-500 font-medium"
                                style={inputStyle}
                              />
                              <button type="button" onClick={() => rosterRenameStudent(s.id)} disabled={rosterSaving} className="text-xs font-semibold text-teal-400 hover:text-teal-300 disabled:opacity-40">Save</button>
                              <button type="button" onClick={() => setRosterRenamingStudent(null)} className="text-xs hover:text-white transition-colors" style={{ color: '#5a5a6a' }}>✕</button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => { setHistoryClassId(cls.id); setSelectedStudentId(s.id); setScreen('history') }}
                                className="text-sm text-left truncate font-medium transition-colors hover:text-teal-400"
                                style={{ color: '#c0c0cc' }}
                              >
                                {s.name}
                              </button>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {rosterConfirmRemove?.studentId === s.id && rosterConfirmRemove?.classId === cls.id ? (
                                  <>
                                    <span className="text-xs" style={{ color: '#5a5a6a' }}>Remove?</span>
                                    <button type="button" onClick={() => rosterRemoveStudent(s.id, cls.id)} disabled={rosterSaving} className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-40">Yes</button>
                                    <button type="button" onClick={() => setRosterConfirmRemove(null)} className="text-xs hover:text-white transition-colors" style={{ color: '#5a5a6a' }}>No</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => { setRosterRenamingStudent(s.id); setRosterStudentRenameValue(s.name) }} className="text-xs text-teal-500/70 hover:text-teal-400 transition-colors p-1" title="Rename student">✎</button>
                                    <button type="button" onClick={() => setRosterConfirmRemove({ studentId: s.id, classId: cls.id })} className="text-xs text-red-500/70 hover:text-red-400 transition-colors p-1" title="Remove student">✕</button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <input
                        type="text"
                        value={rosterNewStudentName[cls.id] ?? ''}
                        onChange={e => setRosterNewStudentName((cur: Record<string, string>) => ({ ...cur, [cls.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && rosterAddStudent(cls.id)}
                        placeholder="Add student…"
                        className="w-full sm:min-w-[14rem] sm:flex-1 text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500"
                        style={inputStyle}
                      />
                      <div className={`grid gap-2 ${classes.length > 1 ? 'grid-cols-3' : 'grid-cols-2'} sm:flex sm:flex-wrap`}>
                        <button type="button" onClick={() => rosterAddStudent(cls.id)} disabled={!(rosterNewStudentName[cls.id] ?? '').trim() || rosterSaving} className="px-3 py-2 bg-teal-500 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                          Add
                        </button>
                        <button type="button" onClick={() => { setRosterPasteClassId(cls.id); setRosterPasteText('') }} className="px-3 py-2 text-sm font-semibold rounded-xl hover:brightness-110 transition-all" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>
                          Paste list
                        </button>
                        {classes.length > 1 && (
                          <button type="button" onClick={() => { setRosterCopySourceClassId(cls.id); setRosterCopyTargetClassId('') }} className="px-3 py-2 text-sm font-semibold rounded-xl hover:brightness-110 transition-all" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>
                            Copy roster
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 flex justify-end" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <button
                        type="button"
                        onClick={() => { setRosterDeletingClass(cls.id); setRosterDeleteConfirmText('') }}
                        className="text-xs transition-colors hover:text-red-400"
                        style={{ color: '#5a5a6a' }}
                      >
                        Delete class
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>

      {/* Copy roster modal */}
      {rosterCopySourceClassId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl shadow-xl w-full max-w-md p-5 flex flex-col gap-4" style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="font-bold" style={{ color: '#f0f0f2' }}>Copy roster from {classes.find((c: AppClass) => c.id === rosterCopySourceClassId)?.name}</h3>
            <p className="text-sm" style={{ color: '#8b8b9a' }}>Pick a class to copy these students into. Students already in that class will be skipped.</p>
            <select
              value={rosterCopyTargetClassId}
              onChange={e => setRosterCopyTargetClassId(e.target.value)}
              className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500"
              style={{ background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }}
            >
              <option value="">Select a class…</option>
              {classes.filter((c: AppClass) => c.id !== rosterCopySourceClassId).map((c: AppClass) => (
                <option key={c.id} value={c.id}>{c.subject} · {c.name} ({(studentsByClass[c.id] ?? []).length} students)</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setRosterCopySourceClassId(null); setRosterCopyTargetClassId('') }} className="px-4 py-2 text-sm font-semibold rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
              <button type="button" onClick={rosterCopyFromClass} disabled={!rosterCopyTargetClassId || rosterSaving} className="px-4 py-2 bg-teal-500 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                {rosterSaving ? 'Copying…' : 'Copy students'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete class modal */}
      {deletingClass && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl shadow-xl w-full max-w-md p-5 flex flex-col gap-4" style={{ background: '#161618', border: '1px solid rgba(239,68,68,0.25)' }}>
            <h3 className="font-bold" style={{ color: '#f0f0f2' }}>Delete {deletingClass.name}?</h3>
            <div className="flex flex-col gap-2">
              <p className="text-sm" style={{ color: '#8b8b9a' }}>
                This is permanent and cannot be undone. Deleting this class also deletes everything recorded for it:
              </p>
              <ul className="text-sm flex flex-col gap-1 pl-4" style={{ color: '#8b8b9a' }}>
                <li>Lessons for this class</li>
                <li>Check-ins, notes, and status history</li>
                <li>Reteach history and small group data</li>
                <li>Skills and mastery tracking for this class</li>
              </ul>
              <p className="text-sm" style={{ color: '#8b8b9a' }}>
                Your students are not deleted. They stay in your other classes, along with that work.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: '#8b8b9a' }}>
                Type <span style={{ color: '#f0f0f2' }}>{deletingClass.name}</span> to confirm
              </label>
              <input
                type="text"
                autoFocus
                value={rosterDeleteConfirmText}
                onChange={e => setRosterDeleteConfirmText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && deleteConfirmed && !rosterSaving) rosterDeleteClass(deletingClass.id) }}
                placeholder={deletingClass.name}
                className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-red-500"
                style={inputStyle}
              />
            </div>
            {rosterDeleteError && <p className="text-xs" style={{ color: '#ef4444' }}>{rosterDeleteError}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={rosterCancelDeleteClass} className="px-4 py-2 text-sm font-semibold rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
              <button
                type="button"
                onClick={() => rosterDeleteClass(deletingClass.id)}
                disabled={!deleteConfirmed || rosterSaving}
                className="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-xl disabled:opacity-40"
              >
                {rosterSaving ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste roster modal */}
      {rosterPasteClassId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl shadow-xl w-full max-w-md p-5 flex flex-col gap-4" style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="font-bold" style={{ color: '#f0f0f2' }}>Paste student names</h3>
            <p className="text-sm" style={{ color: '#8b8b9a' }}>Paste names in any format — numbered list, one per line, comma-separated, whatever you have. AI will sort it out.</p>
            <textarea
              autoFocus
              value={rosterPasteText}
              onChange={e => setRosterPasteText(e.target.value)}
              placeholder={"1. Jane Smith\n2. John Doe\nAlex Johnson, Maria Garcia…"}
              rows={8}
              className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500 resize-none"
              style={{ background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }}
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setRosterPasteClassId(null)} className="px-4 py-2 text-sm font-semibold rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
              <button type="button" onClick={() => rosterBulkAdd(rosterPasteClassId)} disabled={!rosterPasteText.trim() || rosterParsing} className="px-4 py-2 bg-teal-500 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                {rosterParsing ? 'Adding…' : 'Add students'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
