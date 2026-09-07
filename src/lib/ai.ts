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

export type DayLesson = {
  title: string        // short lesson name shown in tracker input
  subject: string      // e.g. "Math", "Science"
  objective: string
  activities: string
  assessment: string
  skills?: string[]    // specific skills being taught, e.g. ["Adding fractions", "Mixed numbers"]
}

// All subjects found across the week, keyed by date then subject name
export type WeekSchedule = Record<string, Record<string, DayLesson>>

const dayLessonSchema: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    subject: { type: 'string' },
    objective: { type: 'string' },
    activities: { type: 'string' },
    assessment: { type: 'string' },
    skills: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'subject', 'objective', 'activities', 'assessment', 'skills'],
  additionalProperties: false,
}

export async function parseLessonPlan(text: string, weekStart: string): Promise<WeekSchedule> {
  const prompt = `You are a helpful assistant for teachers. Given this lesson plan text, extract ALL subjects taught each school day (Monday-Friday) of the week starting ${weekStart}. A teacher may teach multiple subjects per day (e.g. Math, Science, Health, Reading).

Return a JSON object keyed by ISO date (YYYY-MM-DD, for the week of ${weekStart}), then by subject name, in this shape:
{
  "2025-01-06": {
    "Math": {
      "title": "Short lesson name (under 50 chars)",
      "subject": "Math",
      "objective": "One sentence objective",
      "activities": "Brief summary of main activities (1-2 sentences)",
      "assessment": "Exit ticket or assessment method",
      "skills": ["Specific skill 1", "Specific skill 2"]
    }
  }
}

For "skills": extract the 1-4 specific, measurable skills or concepts being taught (e.g. "Adding fractions with unlike denominators", "Identifying the main idea"). Use an empty array if none are clearly stated.

Only include days and subjects that have a clear lesson.
Plain text only, no LaTeX, no markdown. Strip all LaTeX math notation (e.g. $1/4$, $0$ to $1$), write fractions and expressions in plain text (e.g. 1/4, 0 to 1).

Lesson plan text:
${text.slice(0, 6000)}`

  const raw = await openaiChat([{ role: 'user', content: prompt }], {
    name: 'week_schedule',
    schema: {
      type: 'object',
      properties: {
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
              subjects: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { subject: { type: 'string' }, lesson: dayLessonSchema },
                  required: ['subject', 'lesson'],
                  additionalProperties: false,
                },
              },
            },
            required: ['date', 'subjects'],
            additionalProperties: false,
          },
        },
      },
      required: ['days'],
      additionalProperties: false,
    },
  }, 3000)

  const parsed = JSON.parse(raw) as { days: { date: string; subjects: { subject: string; lesson: DayLesson }[] }[] }
  const schedule: WeekSchedule = {}
  for (const day of parsed.days) {
    schedule[day.date] = {}
    for (const { subject, lesson } of day.subjects) {
      schedule[day.date][subject] = lesson
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

export type MiniLesson = { focus: string; warmUp: string; activity: string; check: string }

export async function suggestMiniLesson(skillOrTopic: string, lessonTitles: string[], studentCount: number): Promise<MiniLesson> {
  const prompt = `You are an expert elementary and middle school interventionist. Plan a 5 to 10 minute small group re-teach for ${studentCount} student${studentCount === 1 ? '' : 's'} who did not master: "${skillOrTopic}".

Context, the lessons where they struggled: ${lessonTitles.join('; ') || skillOrTopic}

Provide:
- "focus": one sentence naming the single misconception or gap to target
- "warmUp": under 200 characters, a 1 minute activation task to start the group
- "activity": under 300 characters, the core guided practice with concrete example content (real numbers, words, or problems)
- "check": under 200 characters, how to confirm they can rejoin the class

Plain text only, no LaTeX, no markdown formatting.`

  const raw = await openaiChat([{ role: 'user', content: prompt }], {
    name: 'mini_lesson',
    schema: {
      type: 'object',
      properties: {
        focus: { type: 'string' },
        warmUp: { type: 'string' },
        activity: { type: 'string' },
        check: { type: 'string' },
      },
      required: ['focus', 'warmUp', 'activity', 'check'],
      additionalProperties: false,
    },
  }, 600)

  return JSON.parse(raw) as MiniLesson
}

export type ExitTicket = { title: string; description: string }

export async function suggestExitTickets(lesson: DayLesson | string): Promise<ExitTicket[]> {
  const context = typeof lesson === 'string'
    ? `Lesson: "${lesson}"`
    : `Lesson: "${lesson.title}"\nObjective: ${lesson.objective}\nActivities: ${lesson.activities}\nAssessment: ${lesson.assessment}`

  const prompt = `You are an expert instructional coach for elementary/middle school teachers. Suggest 3 high-quality exit tickets based on this lesson:

${context}

Each ticket needs:
- "title": a short name for the exit ticket (under 60 characters)
- "description": 1-2 sentences describing:
  1) the exact student task/prompt
  2) what evidence it gives about mastery of the objective
  Keep it under 220 characters.

Quality rules:
- Every ticket must directly measure the stated objective, not classroom behavior.
- Use lesson-specific language/content from the objective/activities.
- Include at least one likely misconception or partial-understanding check across the 3 tickets.
- Keep prompts realistic for a 2-3 minute end-of-lesson check.
- Avoid generic ideas like "write what you learned" unless grounded in the exact concept.

Plain text only, no LaTeX, no markdown formatting.`

  const raw = await openaiChat([{ role: 'user', content: prompt }], {
    name: 'exit_tickets',
    schema: {
      type: 'object',
      properties: {
        tickets: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, description: { type: 'string' } },
            required: ['title', 'description'],
            additionalProperties: false,
          },
        },
      },
      required: ['tickets'],
      additionalProperties: false,
    },
  }, 800)

  const parsed = JSON.parse(raw) as { tickets: ExitTicket[] }
  return parsed.tickets
}
