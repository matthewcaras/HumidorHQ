const API_BASE_URL = 'http://localhost:3001/api'

export type StorageOrganizationType = 'GENERAL' | 'DRAWERS' | 'SHELVES' | 'CUSTOM'

export type StorageSubLocationKind = 'GENERAL' | 'DRAWER' | 'SHELF' | 'CUSTOM'

export type StorageSubLocation = {
  id: number
  name: string
  kind: StorageSubLocationKind
  capacity: number | null
  displayOrder: number
  isActive: boolean
}

export type Humidor = {
  id: number
  name: string
  capacity: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  hasShelves: boolean
shelfCount: number | null
  organizationType: StorageOrganizationType
  subLocations: StorageSubLocation[]
}

export type CreateHumidorInput = {
  name: string
  capacity?: string
  organizationType?: StorageOrganizationType
  sectionCount?: string
  hasShelves?: boolean
  shelfCount?: string
}

export type UpdateHumidorInput = {
  name: string
  capacity?: string
  organizationType?: StorageOrganizationType
  sectionCount?: string
  hasShelves?: boolean
  shelfCount?: string
}

type ApiResponse<T> = {
  data: T
}

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  let body: ApiResponse<T> & ApiErrorResponse

  try {
    body = await response.json()
  } catch {
    throw new Error(fallbackMessage)
  }

  if (!response.ok) {
    throw new Error(body.error?.message ?? fallbackMessage)
  }

  return body.data
}

export async function getHumidors(): Promise<Humidor[]> {
  const response = await fetch(`${API_BASE_URL}/humidors`)

  return parseJsonResponse<Humidor[]>(response, 'Failed to load humidors')
}

export async function createHumidor(input: CreateHumidorInput): Promise<Humidor> {
  const response = await fetch(`${API_BASE_URL}/humidors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<Humidor>(response, 'Failed to create humidor')
}

export async function updateHumidor(
  id: number,
  input: UpdateHumidorInput,
): Promise<Humidor> {
  const response = await fetch(`${API_BASE_URL}/humidors/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<Humidor>(response, 'Failed to update humidor')
}

export async function archiveHumidor(id: number): Promise<Humidor> {
  const response = await fetch(`${API_BASE_URL}/humidors/${id}/archive`, {
    method: 'PATCH',
  })

  return parseJsonResponse<Humidor>(response, 'Failed to archive humidor')
}
