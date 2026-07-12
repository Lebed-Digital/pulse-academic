import type { ReportClass } from '../types'

export type PullGroupStudent = {
  id: string
  name: string
  status: 'needs-help' | 'almost'
  lessonId: string
  lessonTitle: string
  skill: string | null
}

export type PullGroup = {
  key: string
  label: string
  students: PullGroupStudent[]
}

export type ClassPullGroups = {
  classId: string
  className: string
  groups: PullGroup[]
}

const MAX_GROUP_SIZE = 6

export function buildPullGroups(reportData: ReportClass[], showSkills: boolean): ClassPullGroups[] {
  return reportData.map(cls => {
    const byKey = new Map<string, Map<string, PullGroupStudent>>()

    for (const student of [...cls.needsSupport, ...cls.checkIn]) {
      for (const lesson of student.lessons) {
        if (lesson.status !== 'needs-help' && lesson.status !== 'almost') continue
        const skill = lesson.skill?.trim() || null
        const key = showSkills && skill ? skill : lesson.title
        if (!byKey.has(key)) byKey.set(key, new Map())
        const members = byKey.get(key)!
        const existing = members.get(student.id)
        if (!existing || (existing.status === 'almost' && lesson.status === 'needs-help')) {
          members.set(student.id, {
            id: student.id,
            name: student.name,
            status: lesson.status,
            lessonId: lesson.lessonId,
            lessonTitle: lesson.title,
            skill,
          })
        }
      }
    }

    const sorted = [...byKey.entries()]
      .map(([key, members]) => {
        const students = [...members.values()].sort((a, b) => {
          if (a.status !== b.status) return a.status === 'needs-help' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        return { key, label: key, students }
      })
      .sort((a, b) => {
        const helpA = a.students.filter(s => s.status === 'needs-help').length
        const helpB = b.students.filter(s => s.status === 'needs-help').length
        if (helpA !== helpB) return helpB - helpA
        return b.students.length - a.students.length
      })

    const groups: PullGroup[] = []
    for (const g of sorted) {
      if (g.students.length <= MAX_GROUP_SIZE) {
        groups.push(g)
        continue
      }
      const parts = Math.ceil(g.students.length / MAX_GROUP_SIZE)
      for (let i = 0; i < parts; i++) {
        const chunk = g.students.slice(i * MAX_GROUP_SIZE, (i + 1) * MAX_GROUP_SIZE)
        groups.push({
          key: `${g.key} (${i + 1} of ${parts})`,
          label: `${g.label} (${i + 1} of ${parts})`,
          students: chunk,
        })
      }
    }

    return { classId: cls.classId, className: cls.className, groups }
  })
}
