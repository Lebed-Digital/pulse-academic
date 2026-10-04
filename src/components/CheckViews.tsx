import { useState } from 'react'
import {
  MARK_LABEL, MARK_TEXT, checkLabel, formatCheckDay, formatCheckTime, progressText, summarize,
  type Check, type CheckResult, type HistoryEntry, type Mark,
} from '../lib/checks'

const surface = { background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }

const SECTION_ORDER: Mark[] = ['needs-help', 'almost', 'got-it', 'absent', 'not-checked']

interface ResultsProps {
  check: Check
  results: CheckResult[]
  nameOf: (studentId: string) => string | null
  recheckCount: number
  busy: boolean
  onBackToGrid: () => void
  onDone: () => void
  onClose: () => void
  onRecheck: () => void
  onOpenStudent: (studentId: string) => void
}

export function ResultsView({ check, results, nameOf, recheckCount, busy, onBackToGrid, onDone, onClose, onRecheck, onOpenStudent }: ResultsProps) {
  const [showGotIt, setShowGotIt] = useState(false)
  const { marks, counts } = summarize(check, results)
  const joinedNames = new Map<string, string>()
  for (const r of results) if (r.check_id === check.id && r.student_name) joinedNames.set(r.student_id, r.student_name)

  const sections = new Map<Mark, { named: { id: string; name: string }[]; gone: number }>()
  for (const mark of SECTION_ORDER) sections.set(mark, { named: [], gone: 0 })
  for (const id of check.participant_ids) {
    const section = sections.get(marks[id])!
    const name = nameOf(id) ?? joinedNames.get(id)
    if (name) section.named.push({ id, name })
    else section.gone++
  }
  for (const section of sections.values()) section.named.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

  const size = (mark: Mark) => sections.get(mark)!.named.length + sections.get(mark)!.gone
  const isOpen = !check.ended_at
  const nothingRecorded = counts.checked === 0 && counts.notHere === 0
  const allGotIt = counts.checked > 0 && size('needs-help') === 0 && size('almost') === 0

  return (
    <main className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full flex flex-col gap-3">
      <div>
        <p className="text-base font-bold break-words" style={{ color: '#f0f0f2' }}>{checkLabel(check)}</p>
        <p className="text-xs mt-1" style={{ color: '#8b8b9a' }}>
          {check.root_check_id ? `Recheck · ${check.participant_ids.length} student${check.participant_ids.length === 1 ? '' : 's'} · ` : ''}
          {formatCheckTime(check.started_at)} · {progressText(counts)}
        </p>
      </div>

      {nothingRecorded && (
        <p className="rounded-2xl px-4 py-4 text-sm font-semibold" style={{ ...surface, color: '#8b8b9a' }}>No understanding recorded yet.</p>
      )}
      {allGotIt && (
        <p className="rounded-2xl px-4 py-4 text-sm font-semibold text-emerald-400" style={surface}>All checked students got it.</p>
      )}

      {SECTION_ORDER.map(mark => {
        const section = sections.get(mark)!
        if (size(mark) === 0) return null
        const collapsed = mark === 'got-it' && !showGotIt
        return (
          <section key={mark} className="rounded-2xl px-4 py-3" style={surface}>
            <div className="flex items-center justify-between gap-3">
              <h3 className={`text-sm font-bold ${MARK_TEXT[mark]}`}>{MARK_LABEL[mark]} · {size(mark)}</h3>
              {mark === 'got-it' && (
                <button type="button" onClick={() => setShowGotIt(v => !v)} className="text-xs font-semibold" style={{ color: '#8b8b9a' }}>
                  {showGotIt ? 'Hide' : 'Show names'}
                </button>
              )}
            </div>
            {!collapsed && (
              <div className="mt-2 flex flex-wrap gap-2">
                {section.named.map(s => (
                  <button key={s.id} type="button" onClick={() => onOpenStudent(s.id)} className="rounded-xl px-3 py-1.5 text-sm font-medium" style={{ background: '#1e1e22', color: '#f0f0f2' }}>
                    {s.name}
                  </button>
                ))}
                {section.gone > 0 && (
                  <span className="px-1 py-1.5 text-xs" style={{ color: '#5a5a6a' }}>+{section.gone} no longer in this class</span>
                )}
              </div>
            )}
          </section>
        )
      })}

      <div className="flex flex-col gap-2 mt-1">
        {recheckCount > 0 && (
          <button type="button" onClick={onRecheck} disabled={busy} className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-teal-500 disabled:opacity-40">
            Recheck {recheckCount} student{recheckCount === 1 ? '' : 's'}
          </button>
        )}
        {isOpen ? (
          <div className="flex gap-2">
            <button type="button" onClick={onBackToGrid} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.07)', color: '#c0c0cc' }}>Back to grid</button>
            <button type="button" onClick={onDone} disabled={busy} className="flex-1 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.07)', color: '#c0c0cc' }}>Done for now</button>
          </div>
        ) : (
          <button type="button" onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.07)', color: '#c0c0cc' }}>Back</button>
        )}
      </div>
    </main>
  )
}

interface RecheckProps {
  title: string
  students: { id: string; name: string }[]
  preselected: string[]
  busy: boolean
  onStart: (studentIds: string[]) => void
  onClose: () => void
}

export function RecheckSheet({ title, students, preselected, busy, onStart, onClose }: RecheckProps) {
  const [selected, setSelected] = useState<string[]>(preselected)

  function toggle(id: string) {
    setSelected(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Choose students to recheck" onClick={e => e.stopPropagation()} className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl px-5 pt-5 pb-8 shadow-xl" style={{ background: '#161618' }}>
        <p className="text-base font-bold" style={{ color: '#f0f0f2' }}>Recheck</p>
        <p className="text-xs mt-1 mb-3 break-words" style={{ color: '#8b8b9a' }}>{title}</p>
        <div className="overflow-y-auto flex flex-col gap-1.5 pr-1">
          {students.map(s => {
            const checked = selected.includes(s.id)
            return (
              <label key={s.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium cursor-pointer" style={{ background: checked ? 'rgba(20,184,166,0.12)' : '#1e1e22', color: '#f0f0f2' }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} className="h-4 w-4 accent-teal-500" />
                {s.name}
              </label>
            )
          })}
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
          <button type="button" onClick={() => onStart(selected)} disabled={selected.length === 0 || busy} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-teal-500 disabled:opacity-40">
            Start recheck · {selected.length}
          </button>
        </div>
      </div>
    </div>
  )
}

interface HistoryProps {
  name: string
  entries: HistoryEntry[]
  onClose: () => void
}

export function StudentHistorySheet({ name, entries, onClose }: HistoryProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`History for ${name}`} onClick={e => e.stopPropagation()} className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl px-5 pt-5 pb-8 shadow-xl" style={{ background: '#161618' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-lg font-bold" style={{ color: '#f0f0f2' }}>{name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>Results in this class, newest first</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none p-1" style={{ color: '#5a5a6a' }}>✕</button>
        </div>
        <div className="overflow-y-auto flex flex-col gap-2 pr-1">
          {entries.length === 0 && <p className="text-sm" style={{ color: '#8b8b9a' }}>Nothing recorded yet.</p>}
          {entries.map(entry => {
            const mark: Mark = entry.result ?? 'not-checked'
            return (
              <div key={entry.check.id} className="rounded-xl px-3 py-2.5" style={{ background: '#1e1e22' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words" style={{ color: '#f0f0f2' }}>{checkLabel(entry.check)}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>
                      {formatCheckDay(entry.check.started_at)}{entry.check.root_check_id ? ' · Recheck' : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${MARK_TEXT[mark]}`}>{entry.result ? MARK_LABEL[mark] : 'Note only'}</span>
                </div>
                {entry.note && <p className="text-xs mt-1.5 break-words" style={{ color: '#c0c0cc' }}>{entry.note}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
