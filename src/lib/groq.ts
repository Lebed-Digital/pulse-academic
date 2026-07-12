const SUPABASE_URL = 'https://zhkgdbjhcignpcspllso.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const MODEL = 'llama-3.3-70b-versatile'

async function groqChat(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/groq-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.3 }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq proxy error ${res.status}: ${body.slice(0, 200)}`)
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

export async function parseLessonPlan(text: string, weekStart: string): Promise<WeekSchedule> {
  const prompt = `You are a helpful assistant for teachers. Given this lesson plan text, extract ALL subjects taught each school day (Monday–Friday) of the week starting ${weekStart}. A teacher may teach multiple subjects per day (e.g. Math, Science, Health, Reading).

Return ONLY valid JSON in this format (use ISO dates YYYY-MM-DD for the week of ${weekStart}):
{
  "2025-01-06": {
    "Math": {
      "title": "Short lesson name (under 50 chars)",
      "subject": "Math",
      "objective": "One sentence objective",
      "activities": "Brief summary of main activities (1-2 sentences)",
      "assessment": "Exit ticket or assessment method",
      "skills": ["Specific skill 1", "Specific skill 2"]
    },
    "Science": {
      "title": "Short lesson name (under 50 chars)",
      "subject": "Science",
      "objective": "One sentence objective",
      "activities": "Brief summary of main activities (1-2 sentences)",
      "assessment": "Exit ticket or assessment method",
      "skills": ["Specific skill 1", "Specific skill 2"]
    }
  }
}

For "skills": extract the 1–4 specific, measurable skills or concepts being taught (e.g. "Adding fractions with unlike denominators", "Identifying the main idea"). If none are clearly stated, omit the field or use an empty array.

Only include days and subjects that have a clear lesson. Do not include any explanation outside the JSON.
Strip all LaTeX math notation (e.g. $1/4$, $0$ to $1$) — write fractions and expressions in plain text (e.g. 1/4, 0 to 1).

Lesson plan text:
${text.slice(0, 6000)}`

  const raw = await groqChat([{ role: 'user', content: prompt }])
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not parse lesson plan')
  return JSON.parse(match[0])
}

export async function parseStudentNames(text: string): Promise<string[]> {
  const prompt = `Extract student names from this text. The text may be a numbered list, bullet list, comma-separated, one per line, or mixed. Return ONLY a JSON array of clean full names (capitalized properly), no duplicates, no blank entries. No explanation, just the array.

Text:
${text.slice(0, 3000)}`

  const raw = await groqChat([{ role: 'user', content: prompt }])
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Could not parse student names')
  return JSON.parse(match[0])
}

export type MiniLesson = { focus: string; warmUp: string; activity: string; check: string }

export async function suggestMiniLesson(skillOrTopic: string, lessonTitles: string[], studentCount: number): Promise<MiniLesson> {
  const prompt = `You are an expert elementary and middle school interventionist. Plan a 5 to 10 minute small group re-teach for ${studentCount} student${studentCount === 1 ? '' : 's'} who did not master: "${skillOrTopic}".

Context, the lessons where they struggled: ${lessonTitles.join('; ') || skillOrTopic}

Return ONLY a JSON object with these keys:
- "focus": one sentence naming the single misconception or gap to target
- "warmUp": under 200 characters, a 1 minute activation task to start the group
- "activity": under 300 characters, the core guided practice with concrete example content (real numbers, words, or problems)
- "check": under 200 characters, how to confirm they can rejoin the class

Plain text only, no LaTeX, no markdown formatting. No explanation outside the JSON.
Example: {"focus":"Students treat the numerator and denominator as two separate whole numbers.","warmUp":"Show a paper strip folded into 4 parts. Ask: what does the 4 in 3/4 tell us?","activity":"Draw a number line 0 to 1. Together place 1/4, 2/4, 3/4. Each student then places 2/3 on their own line and explains the spacing.","check":"Each student places 3/5 on a blank number line correctly before returning to their seat."}`

  const raw = await groqChat([{ role: 'user', content: prompt }])
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not parse mini lesson')
  return JSON.parse(match[0])
}

export type ExitTicket = { title: string; description: string }

export async function suggestExitTickets(lesson: DayLesson | string): Promise<ExitTicket[]> {
  const context = typeof lesson === 'string'
    ? `Lesson: "${lesson}"`
    : `Lesson: "${lesson.title}"\nObjective: ${lesson.objective}\nActivities: ${lesson.activities}\nAssessment: ${lesson.assessment}`

  const prompt = `You are an expert instructional coach for elementary/middle school teachers. Suggest 3 high-quality exit tickets based on this lesson:

${context}

Return ONLY a JSON array of 3 objects. Each object has:
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

No explanation outside the JSON.
Example: [{"title":"Number Line Placement","description":"Students mark 3/4 and 5/4 on a blank number line. Reveals if they understand fractions greater and less than 1."},{"title":"True or False","description":"Students answer: 2/4 and 1/2 are the same point on a number line. Shows if they can identify equivalent fractions."},{"title":"Equivalent to 1 Whole","description":"Students name one fraction equal to 1 whole. Checks understanding of fractions with equal numerator and denominator."}]`

  const raw = await groqChat([{ role: 'user', content: prompt }])
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Could not parse exit tickets')
  return JSON.parse(match[0])
}
