const API_BASE_URL = 'http://localhost:3001/api'

export type Humidor = {
  id: number
  name: string
  capacity: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  hasShelves: boolean
shelfCount: number | null
}

export type CreateHumidorInput = {
  name: string
  capacity?: string
  hasShelves?: boolean
  shelfCount?: string
}

export type UpdateHumidorInput = {
  name: string
  capacity?: string
  hasShelves?: boolean
  shelfCount?: string
}

export async function getHumidors(): Promise<Humidor[]> {
  const response = await fetch(`${API_BASE_URL}/humidors`)

  if (!response.ok) {
    throw new Error('Failed to load humidors')
  }

  return response.json()
}

export async function createHumidor(input: CreateHumidorInput): Promise<Humidor> {
  const response = await fetch(`${API_BASE_URL}/humidors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error('Failed to create humidor')
  }

  return response.json()
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

  if (!response.ok) {
    throw new Error('Failed to update humidor')
  }

  return response.json()
}

export async function archiveHumidor(id: number): Promise<Humidor> {
  const response = await fetch(`${API_BASE_URL}/humidors/${id}/archive`, {
    method: 'PATCH',
  })

  if (!response.ok) {
    throw new Error('Failed to archive humidor')
  }

  return response.json()
}