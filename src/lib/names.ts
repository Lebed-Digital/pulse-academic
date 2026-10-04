import type { NameFormat } from '../types'

export function formatStudentName(fullName: string, format: NameFormat, classmates: string[]): string {
  const parts = fullName.trim().split(/\s+/)
  const first = parts[0]
  const rest = parts.slice(1)
  const lastInitial = rest.length > 0 ? rest[rest.length - 1][0].toUpperCase() + '.' : ''
  if (format === 'full') return fullName
  if (format === 'initials') return parts.map(p => p[0].toUpperCase()).join('.') + '.'
  const dupFirst = classmates.filter(n => n.trim().split(/\s+/)[0] === first && n !== fullName)
  if (dupFirst.length === 0 || !lastInitial) return first
  const dupFirstAndLast = dupFirst.filter(n => {
    const p = n.trim().split(/\s+/)
    return p.length > 1 && p[p.length - 1][0].toUpperCase() + '.' === lastInitial
  })
  // Same first name and last initial: only the full name tells them apart.
  return dupFirstAndLast.length === 0 ? `${first} ${lastInitial}` : fullName
}
