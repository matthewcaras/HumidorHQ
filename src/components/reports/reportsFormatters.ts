export const REPORTS_EMPTY_VALUE = '—'

const reportsDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function reportsLocalYearBounds(year: number) {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  }
}

export function formatReportsMoney(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return REPORTS_EMPTY_VALUE
  }

  const text = String(value).trim()
  const match = text.match(/^(-)?(\d+)(?:\.(\d+))?$/)

  if (!match) {
    return REPORTS_EMPTY_VALUE
  }

  const fraction = match[3] ?? ''
  const cents =
    BigInt(match[2]) * 100n +
    BigInt(Number(fraction.slice(0, 2).padEnd(2, '0'))) +
    BigInt(Number(fraction[2] ?? '0') >= 5 ? 1 : 0)
  const dollars = cents / 100n
  const centsText = String(cents % 100n).padStart(2, '0')
  const isNegative = match[1] === '-' && cents !== 0n

  return isNegative ? `$(${dollars}.${centsText})` : `$${dollars}.${centsText}`
}

export function formatReportsDate(value: string | null | undefined) {
  if (!value) {
    return REPORTS_EMPTY_VALUE
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return REPORTS_EMPTY_VALUE
  }

  return reportsDateFormatter.format(date)
}

export function reportsUtcDateKey(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(
    date.getUTCDate(),
  )}`
}

export function reportsPluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}

export function reportsDirectionLabel(
  sortBy: 'EVENT_DATE' | 'RECORDED_DATE' | 'CIGAR' | 'QUANTITY' | 'COST' | 'MSRP',
  direction: 'ASC' | 'DESC',
) {
  if (sortBy === 'CIGAR') {
    return direction === 'ASC' ? 'A-Z' : 'Z-A'
  }

  if (sortBy === 'EVENT_DATE' || sortBy === 'RECORDED_DATE') {
    return direction === 'ASC' ? 'Oldest first' : 'Newest first'
  }

  return direction === 'ASC' ? 'Low to high' : 'High to low'
}
