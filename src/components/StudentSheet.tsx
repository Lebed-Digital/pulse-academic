import { useEffect, useRef, useState } from 'react'
import MicButton from './MicButton'
import { MARK_LABEL, type Result } from '../lib/checks'

export type ResultFields = { result?: Result | null; note?: string | null }

interface Props {
  studentName: string
  focusLabel: string
  saved: { result: Result | null; note: string | null }
  onSave: (fields: ResultFields) => Promise<boolean>
  onClose: () => void
}

const UNDERSTANDING: Result[] = ['got-it', 'almost', 'needs-help']

const SELECTED: Record<Result, { background: string; border: string; color: string }> = {
  'got-it':     { background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.6)', color: '#34d399' },
  'almost':     { background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.6)', color: '#facc15' },
  'needs-help': { background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.6)', color: '#f87171' },
  'absent':     { background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.6)', color: '#60a5fa' },
}

const UNSELECTED = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#c0c0cc' }

export default function StudentSheet({ studentName, focusLabel, saved, onSave, onClose }: Props) {
  const [result, setResult] = useState<Result | null>(saved.result)
  const [note, setNote] = useState(saved.note ?? '')
  const [noteOpen, setNoteOpen] = useState(Boolean(saved.note))
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => { dialogRef.current?.focus() }, [])

  const resultChanged = result !== saved.result
  const noteChanged = note.trim() !== (saved.note ?? '')
  const dirty = resultChanged || noteChanged

  function requestClose() {
    if (saving) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  // Listens on the document, not the dialog: disabling Save while it runs drops
  // keyboard focus out of the sheet, and Escape still has to work afterwards.
  // Tab is kept inside the sheet so the keyboard can't reach the navigation
  // behind it and leave with an unsaved draft.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        const dialog = dialogRef.current
        if (!dialog) return
        const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])')]
        const first = focusable[0] ?? dialog
        const last = focusable[focusable.length - 1] ?? dialog
        const active = document.activeElement
        const leaving = e.shiftKey ? active === first || active === dialog : active === last
        if (!dialog.contains(active) || leaving) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
        }
        return
      }
      if (e.key !== 'Escape' || saving) return
      if (dirty) setConfirmDiscard(true)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dirty, saving, onClose])

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    setFailed(false)
    const fields: ResultFields = {}
    if (resultChanged) fields.result = result
    if (noteChanged) fields.note = note.trim() || null
    const ok = await onSave(fields)
    if (!ok) {
      setSaving(false)
      setFailed(true)
      dialogRef.current?.focus()
    }
  }

  function choice(value: Result, compact = false) {
    const selected = result === value
    return (
      <button
        key={value}
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={saving}
        onClick={() => setResult(value)}
        className={`flex items-center gap-3 rounded-2xl text-left font-semibold transition-colors ${compact ? 'px-4 py-2.5 text-sm' : 'w-full px-4 py-3.5 text-base'}`}
        style={selected ? SELECTED[value] : UNSELECTED}
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs"
          style={{ border: `2px solid ${selected ? SELECTED[value].color : 'rgba(255,255,255,0.25)'}` }}
          aria-hidden="true"
        >
          {selected ? '●' : ''}
        </span>
        {MARK_LABEL[value]}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={requestClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Record a result for ${studentName}`}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl px-5 pt-5 pb-8 shadow-xl outline-none"
        style={{ background: '#161618' }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight" style={{ color: '#f0f0f2' }}>{studentName}</p>
            <p className="text-xs mt-1 break-words" style={{ color: '#8b8b9a' }}>{focusLabel}</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close" className="text-lg leading-none p-1" style={{ color: '#5a5a6a' }}>✕</button>
        </div>

        <div role="radiogroup" aria-label="Result" className="flex flex-col gap-2">
          {UNDERSTANDING.map(value => choice(value))}
          <div className="flex items-center justify-between gap-2 mt-1">
            {choice('absent', true)}
            {!noteOpen && (
              <button type="button" onClick={() => setNoteOpen(true)} disabled={saving} className="px-4 py-2.5 rounded-2xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.05)', color: '#8b8b9a' }}>
                Add note
              </button>
            )}
          </div>
        </div>

        {noteOpen && (
          <div className="relative mt-3">
            <textarea
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={saving}
              aria-label="Note"
              placeholder="Optional note"
              className="w-full rounded-2xl px-4 py-3 pr-12 text-sm outline-none focus:border-teal-500 resize-none border"
              style={{ background: '#1e1e22', borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0f2' }}
            />
            <MicButton onTranscript={text => setNote(cur => cur ? cur + ' ' + text : text)} />
          </div>
        )}

        {saved.result !== null && result !== null && (
          <button type="button" onClick={() => setResult(null)} disabled={saving} className="mt-3 text-xs underline" style={{ color: '#5a5a6a' }}>
            Clear result
          </button>
        )}

        {failed && <p role="alert" className="mt-3 text-sm font-semibold" style={{ color: '#f87171' }}>Not saved. Try again.</p>}

        {confirmDiscard ? (
          <div className="mt-4">
            <p className="text-sm font-semibold mb-2" style={{ color: '#f0f0f2' }}>Discard your changes?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDiscard(false)} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-teal-500">Keep editing</button>
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>Discard</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={requestClose} disabled={saving} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.07)', color: '#8b8b9a' }}>Cancel</button>
            <button type="button" onClick={save} disabled={!dirty || saving} className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-teal-500 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
