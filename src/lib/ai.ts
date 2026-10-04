const SUPABASE_URL = 'https://zhkgdbjhcignpcspllso.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const MODEL = 'gpt-5.6-luna'

type JsonSchema = Record<string, unknown>

async function openaiChat(messages: { role: string; content: string }[], schema?: { name: string; schema: JsonSchema }, maxTokens = 1500): Promise<string> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    reasoning_effort: 'none',
    max_completion_tokens: maxTokens,
  }
  if (schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: schema.name, schema: schema.schema, strict: true },
    }
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/openai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI proxy error ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  return json.choices[0].message.content as string
}

export type DayFocus = {
  title: string   // the plan's own lesson name or number, e.g. "Lesson 17"
  focus: string   // one learning focus, empty when the plan doesn't make one clear
}

// Keyed by ISO date, then by one of the teacher's class subjects
export type WeekSchedule = Record<string, Record<string, DayFocus>>

export async function parseLessonPlan(text: string, weekStart: string, classSubjects: string[]): Promise<WeekSchedule> {
  const prompt = `You are a helpful assistant for teachers. This teacher teaches these subjects: ${classSubjects.join(', ')}.

From the lesson plan text below, find the lesson taught each school day (Monday-Friday) of the week starting ${weekStart} for each of those subjects. Assign every lesson to the one subject from that list it belongs to. Skip lessons that match none of them.

For each lesson return:
- "subject": exactly one of the subjects listed above
- "title": the lesson's own name or number exactly as the plan writes it (for example "Lesson 17" or "Unit 3 Lesson 4"). If the plan gives none, a short name under 50 characters.
- "focus": the single main learning focus of that lesson, under 80 characters, phrased as what students should understand or be able to do. If the plan does not make one focus clear, return an empty string. Do not guess.

Use ISO dates (YYYY-MM-DD) within the week of ${weekStart}. Only include days that have a clear lesson.
Plain text only, no LaTeX, no markdown. Write fractions and expressions in plain text (e.g. 1/4, 0 to 1).

Lesson plan text:
${text.slice(0, 6000)}`

  const raw = await openaiChat([{ role: 'user', content: prompt }], {
    name: 'week_focus',
    schema: {
      type: 'object',
      properties: {
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
              entries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    subject: { type: 'string', enum: classSubjects },
                    title: { type: 'string' },
                    focus: { type: 'string' },
                  },
                  required: ['subject', 'title', 'focus'],
                  additionalProperties: false,
                },
              },
            },
            required: ['date', 'entries'],
            additionalProperties: false,
          },
        },
      },
      required: ['days'],
      additionalProperties: false,
    },
  }, 3000)

  const parsed = JSON.parse(raw) as { days: { date: string; entries: { subject: string; title: string; focus: string }[] }[] }
  const schedule: WeekSchedule = {}
  for (const day of parsed.days) {
    for (const { subject, title, focus } of day.entries) {
      if (!classSubjects.includes(subject)) continue
      schedule[day.date] ??= {}
      schedule[day.date][subject] ??= { title: title.trim(), focus: focus.trim() }
    }
  }
  return schedule
}

export async function parseStudentNames(text: string): Promise<string[]> {
  const prompt = `Extract student names from this text. The text may be a numbered list, bullet list, comma-separated, one per line, or mixed. Return clean full names (capitalized properly), no duplicates, no blank entries.

Text:
${text.slice(0, 3000)}`

  const raw = await openaiChat([{ role: 'user', content: prompt }], {
    name: 'student_names',
    schema: {
      type: 'object',
      properties: { names: { type: 'array', items: { type: 'string' } } },
      required: ['names'],
      additionalProperties: false,
    },
  }, 1000)

  const parsed = JSON.parse(raw) as { names: string[] }
  return parsed.names
}
