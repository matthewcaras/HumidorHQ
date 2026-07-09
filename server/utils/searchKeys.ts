export function normalizeSearchKey(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  // Hidden comparison/search key only; display values must stay unchanged.
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
}
