// lib/actions/utils.ts
import { TimeFilter } from './types'

export function getTimeFilter(range: string): TimeFilter {
  const now = new Date()
  const startDate = new Date()

  switch (range) {
    case '7D':
      startDate.setDate(now.getDate() - 7)
      break
    case '30D':
      startDate.setDate(now.getDate() - 30)
      break
    case '3M':
      startDate.setMonth(now.getMonth() - 3)
      break
    case '6M':
      startDate.setMonth(now.getMonth() - 6)
      break
    case '1Y':
      startDate.setFullYear(now.getFullYear() - 1)
      break
    case 'ALL':
    default:
      startDate.setFullYear(2020)
      break
  }

  return {
    range: range as TimeFilter['range'],
    startDate,
    endDate: now
  }
}

export function generateChartColors(count: number): string[] {
  const baseColors = [
    '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe',
    '#ef4444', '#f87171', '#fca5a5', '#fecaca',
    '#10b981', '#34d399', '#6ee7b7', '#a7f3d0',
    '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a'
  ]
  return baseColors.slice(0, count)
}

export function calculateRelevance(text: string, query: string): number {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  
  if (lowerText === lowerQuery) return 1.0
  if (lowerText.startsWith(lowerQuery)) return 0.9
  if (lowerText.includes(lowerQuery)) return 0.7
  if (lowerText.split(' ').some(word => word.startsWith(lowerQuery))) return 0.5
  
  const queryWords = lowerQuery.split(' ')
  const textWords = lowerText.split(' ')
  const matches = queryWords.filter(qWord => 
    textWords.some(tWord => tWord.includes(qWord))
  )
  
  return matches.length / queryWords.length * 0.3
}