import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseLessonPlan, type WeekSchedule } from '../lib/ai'
import { skipPlanDay, weekDates } from '../lib/checks'

interface Props {
  userId: string
  classSubjects: string[]
  weekStart: string
  nextWeekStart: string
  today: string
  onCurrentWeekSaved: (schedule: WeekSchedule) => void
}

type Loaded = { weekStart: string; schedule: WeekSchedule; failed: boolean }
type Edit = { date: string; subject: string; title: string; focus: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const surface = { background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }
const inputStyle = { background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
    GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await getDocument({ data: arrayBuffer }).promise
    let text = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
    }
    return text
  }
  if (ext === 'docx' || ext === 'doc') {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  }
  return await file.text()
}

export default function PlanScreen({ userId, classSubjects, weekStart, nextWeekStart, today, onCurrentWeekSaved }: Props) {
  const [viewWeek, setViewWeek] = useState<'current' | 'next'>('current')
  const activeWeekStart = viewWeek === 'next' ? nextWeekStart : weekStart
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [planText, setPlanText] = useState('')
  const [busy, setBusy] = useState<'extract' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [unsaved, setUnsaved] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [skipConfirm, setSkipConfirm] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('week_plans')
      .select('plan_json')
      .eq('user_id', userId)
      .eq('week_start', activeWeekStart)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return
        setLoaded({ weekStart: activeWeekStart, schedule: (data?.plan_json as WeekSchedule | undefined) ?? {}, failed: Boolean(err) })
      })
    return () => { cancelled = true }
  }, [userId, activeWeekStart])

  const current = loaded?.weekStart === activeWeekStart ? loaded : null
  const schedule = current?.schedule ?? {}
  const dates = weekDates(activeWeekStart)
  const hasEntries = dates.some(date => Object.keys(schedule[date] ?? {}).length > 0)
  const uploadVisible = current !== null && !current.failed && (showUpload || !hasEntries)

  function switchWeek(week: 'current' | 'next') {
    if (busy !== null) return
    setViewWeek(week)
    setPlanText('')
    setError('')
    setUnsaved(false)
    setShowUpload(false)
    setEdit(null)
    setSkipConfirm(null)
  }

  async function persist(next: WeekSchedule): Promise<boolean> {
    const savingWeek = activeWeekStart
    setBusy('save')
    setError('')
    setLoaded({ weekStart: savingWeek, schedule: next, failed: false })
    const { error: err } = await supabase
      .from('week_plans')
      .upsert({ user_id: userId, week_start: savingWeek, plan_json: next }, { onConflict: 'user_id,week_start' })
    setBusy(null)
    if (err) {
      setUnsaved(true)
      setError('Could not save the plan. Check your connection and try again.')
      return false
    }
    setUnsaved(false)
    if (savingWeek === weekStart) onCurrentWeekSaved(next)
    return true
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      setPlanText(await extractTextFromFile(file))
    } catch {
      setError('Could not read file. Try copy/pasting the text instead.')
    }
    e.target.value = ''
  }

  async function extract() {
    if (!planText.trim() || busy) return
    setBusy('extract')
    setError('')
    let next: WeekSchedule
    try {
      const parsed = await parseLessonPlan(planText, activeWeekStart, classSubjects)
      next = Object.fromEntries(Object.entries(parsed).filter(([date]) => dates.includes(date)))
    } catch (err) {
      setBusy(null)
      setError(`Could not read the plan: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (Object.keys(next).length === 0) {
      setBusy(null)
      setError(`No lessons found for ${classSubjects.join(', ')} in that week. Check the text, or add each day's focus by hand below.`)
      return
    }
    setPlanText('')
    setShowUpload(false)
    await persist(next)
  }

  // Every change saves the whole week, so nothing may start while a save or an
  // extraction is still running: an older response landing last would undo a newer one.
  function saveEdit() {
    if (!edit || busy !== null) return
    const title = edit.title.trim()
    const focus = edit.focus.trim()
    if (!title && !focus) return
    setEdit(null)
    persist({ ...schedule, [edit.date]: { ...schedule[edit.date], [edit.subject]: { title, focus } } })
  }

  function removeEntry(date: string, subject: string) {
    if (busy !== null) return
    const day = { ...schedule[date] }
    delete day[subject]
    const next = { ...schedule }
    if (Object.keys(day).length > 0) next[date] = day
    else delete next[date]
    persist(next)
  }

  function skipDay(date: string, pushBack: boolean) {
    if (busy !== null) return
    setSkipConfirm(null)
    setEdit(null)
    persist(skipPlanDay(schedule, dates, date, pushBack))
  }

  return (
    <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
      <h2 className="text-base font-bold" style={{ color: '#f0f0f2' }}>Weekly Lesson Plan</h2>
      <p className="text-xs mt-1 mb-3" style={{ color: '#8b8b9a' }}>Upload once for the week so Pulse knows each day's focus.</p>

      <div className="flex gap-2 mb-4">
        {(['current', 'next'] as const).map(week => (
          <button
            key={week}
            type="button"
            onClick={() => switchWeek(week)}
            disabled={busy !== null}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60"
            style={viewWeek === week ? { background: '#14b8a6', color: '#fff' } : { background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}
          >
            {week === 'current' ? 'This week' : 'Next week'} · {formatDay(week === 'current' ? weekStart : nextWeekStart)}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-xs text-red-400 mb-3">{error}</p>}
      {unsaved && (
        <button type="button" onClick={() => persist(schedule)} disabled={busy !== null} className="w-full mb-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-500 disabled:opacity-40">
          {busy === 'save' ? 'Saving…' : 'Save plan'}
        </button>
      )}

      {current === null ? (
        <p className="text-sm text-center py-10" style={{ color: '#8b8b9a' }}>Loading…</p>
      ) : current.failed ? (
        <p className="text-sm py-6" style={{ color: '#f87171' }}>Couldn't load this week's plan. Check your connection and reopen Plan.</p>
      ) : (
        <>
          {uploadVisible && (
            <div className="rounded-2xl px-4 py-4 mb-4" style={surface}>
              <p className="text-sm font-semibold mb-3" style={{ color: '#f0f0f2' }}>Upload or paste your lesson plan</p>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl py-3 text-sm hover:border-teal-500 hover:text-teal-400 transition-colors mb-3" style={{ border: '2px dashed rgba(255,255,255,0.15)', color: '#8b8b9a' }}>
                Upload PDF, Word, or text file
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={handleFileUpload} />
              <textarea
                value={planText}
                onChange={e => setPlanText(e.target.value)}
                placeholder={'Or paste your lesson plan here…\n\nMonday: Lesson 17, adding fractions with unlike denominators\nTuesday: Lesson 18, subtracting fractions\n…'}
                rows={8}
                className="w-full text-sm rounded-xl px-4 py-3 outline-none resize-none border focus:border-teal-500"
                style={inputStyle}
              />
              <div className="flex gap-2 mt-3">
                {hasEntries && (
                  <button type="button" onClick={() => { setShowUpload(false); setPlanText('') }} className="px-4 py-3 text-sm font-semibold rounded-2xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
                )}
                <button type="button" onClick={extract} disabled={!planText.trim() || busy !== null} className="flex-1 py-3 bg-teal-500 text-white text-sm font-semibold rounded-2xl disabled:opacity-40">
                  {busy === 'extract' ? 'Reading your plan…' : busy === 'save' ? 'Saving…' : hasEntries ? 'Replace this plan' : 'Save plan'}
                </button>
              </div>
            </div>
          )}

          {hasEntries && !showUpload && (
            <button type="button" onClick={() => setShowUpload(true)} className="text-xs mb-3 hover:text-teal-400 transition-colors" style={{ color: '#5a5a6a' }}>Upload a new plan</button>
          )}

          <div className="flex flex-col gap-3">
            {dates.map((date, i) => {
              const day = schedule[date] ?? {}
              const dayHasEntries = Object.keys(day).length > 0
              return (
                <div key={date} className="rounded-2xl px-4 py-3" style={surface}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold" style={{ color: date === today ? '#2dd4bf' : '#f0f0f2' }}>
                      {DAYS[i]} <span className="text-xs font-semibold" style={{ color: '#5a5a6a' }}>{formatDay(date)}{date === today ? ' · Today' : ''}</span>
                    </p>
                    {dayHasEntries && skipConfirm !== date && (
                      <button type="button" onClick={() => setSkipConfirm(date)} disabled={busy !== null} className="text-xs font-semibold disabled:opacity-40" style={{ color: '#5a5a6a' }}>Skip day</button>
                    )}
                  </div>

                  {skipConfirm === date && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      <button type="button" onClick={() => skipDay(date, false)} disabled={busy !== null} className="text-xs font-semibold px-3 py-2 rounded-xl text-left text-red-400 disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.1)' }}>Just remove this day</button>
                      <button type="button" onClick={() => skipDay(date, true)} disabled={busy !== null} className="text-xs font-semibold px-3 py-2 rounded-xl text-left text-amber-400 disabled:opacity-40" style={{ background: 'rgba(251,191,36,0.1)' }}>
                        Push remaining days back
                        <span className="block font-normal mt-0.5" style={{ color: '#8b8b9a' }}>Friday's focus will drop off this week's plan.</span>
                      </button>
                      <button type="button" onClick={() => setSkipConfirm(null)} className="text-xs px-1 py-1 text-left" style={{ color: '#5a5a6a' }}>Cancel</button>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 mt-2">
                    {classSubjects.map(subject => {
                      const entry = day[subject]
                      const editing = edit?.date === date && edit.subject === subject
                      if (editing) {
                        return (
                          <div key={subject} className="rounded-xl px-3 py-3" style={{ background: '#1e1e22' }}>
                            <p className="text-xs font-semibold text-teal-400 mb-2">{subject}</p>
                            <label className="block text-xs mb-1" style={{ color: '#8b8b9a' }}>Focus</label>
                            <input type="text" autoFocus value={edit.focus} onChange={e => setEdit({ ...edit, focus: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveEdit()} placeholder="What students should understand" className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500" style={inputStyle} />
                            <label className="block text-xs mt-2 mb-1" style={{ color: '#8b8b9a' }}>Lesson label</label>
                            <input type="text" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveEdit()} placeholder="e.g. Lesson 17" className="w-full text-sm rounded-xl px-3 py-2 outline-none border focus:border-teal-500" style={inputStyle} />
                            <div className="flex gap-2 mt-3">
                              <button type="button" onClick={saveEdit} disabled={busy !== null || (!edit.focus.trim() && !edit.title.trim())} className="px-4 py-1.5 bg-teal-500 text-white text-xs font-semibold rounded-xl disabled:opacity-40">Save</button>
                              <button type="button" onClick={() => setEdit(null)} className="px-4 py-1.5 text-xs font-semibold rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
                            </div>
                          </div>
                        )
                      }
                      const focus = entry?.focus?.trim()
                      const title = entry?.title?.trim()
                      return (
                        <div key={subject} className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: '#1e1e22' }}>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-teal-400">{subject}</p>
                            {entry ? (
                              <>
                                <p className="text-sm font-semibold mt-0.5 break-words" style={{ color: '#f0f0f2' }}>{focus || title}</p>
                                <p className="text-xs mt-0.5 break-words" style={{ color: '#5a5a6a' }}>
                                  {focus ? title : 'No clear focus found, using lesson name'}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs mt-0.5" style={{ color: '#5a5a6a' }}>Nothing planned</p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <button type="button" onClick={() => { setSkipConfirm(null); setEdit({ date, subject, title: title ?? '', focus: focus ?? '' }) }} disabled={busy !== null} className="text-xs font-semibold text-teal-400 disabled:opacity-40">
                              {entry ? 'Edit' : 'Add focus'}
                            </button>
                            {entry && (
                              <button type="button" onClick={() => removeEntry(date, subject)} disabled={busy !== null} className="text-xs font-semibold disabled:opacity-40" style={{ color: '#5a5a6a' }}>Remove</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
