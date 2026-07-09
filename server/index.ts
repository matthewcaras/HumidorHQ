import express from 'express'
import cors from 'cors'
import { PrismaClient } from '../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import {
  archiveCatalogCigar,
  CatalogServiceError,
  createCatalogCigar,
  getCatalogCigars,
  updateCatalogCigar,
} from './services/catalogService.ts'

const app = express()
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
})

const prisma = new PrismaClient({ adapter })

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Humidor HQ' })
})

function catalogIdParam(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    throw new CatalogServiceError(
      'Catalog cigar id must be a positive integer.',
      'CATALOG_VALIDATION_ERROR',
      400,
    )
  }

  return id
}

function handleCatalogError(error: unknown, res: express.Response) {
  if (error instanceof CatalogServiceError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    })
    return
  }

  res.status(500).json({
    error: {
      code: 'CATALOG_UNEXPECTED_ERROR',
      message: 'The catalog request could not be completed.',
    },
  })
}

app.get('/api/catalog', async (req, res) => {
  try {
    const catalogCigars = await getCatalogCigars({
      manufacturer:
        typeof req.query.manufacturer === 'string' ? req.query.manufacturer : undefined,
      series: typeof req.query.series === 'string' ? req.query.series : undefined,
      vitola: typeof req.query.vitola === 'string' ? req.query.vitola : undefined,
      wrapper: typeof req.query.wrapper === 'string' ? req.query.wrapper : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      includeArchived: req.query.includeArchived === 'true',
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    })

    res.json({ data: catalogCigars })
  } catch (error) {
    handleCatalogError(error, res)
  }
})

app.post('/api/catalog', async (req, res) => {
  try {
    const catalogCigar = await createCatalogCigar(req.body)
    res.status(201).json({ data: catalogCigar })
  } catch (error) {
    handleCatalogError(error, res)
  }
})

app.put('/api/catalog/:id', async (req, res) => {
  try {
    const catalogCigar = await updateCatalogCigar(catalogIdParam(req.params.id), req.body)
    res.json({ data: catalogCigar })
  } catch (error) {
    handleCatalogError(error, res)
  }
})

app.delete('/api/catalog/:id', async (req, res) => {
  try {
    const catalogCigar = await archiveCatalogCigar(catalogIdParam(req.params.id))
    res.json({ data: catalogCigar })
  } catch (error) {
    handleCatalogError(error, res)
  }
})

app.get('/api/humidors', async (_req, res) => {
  const humidors = await prisma.storageLocation.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
  })

  res.json(humidors)
})

app.post('/api/humidors', async (req, res) => {
const { name, capacity, hasShelves, shelfCount } = req.body

  const humidor = await prisma.storageLocation.create({
  data: {
  name,
  capacity: capacity ? Number(capacity) : null,
  hasShelves: Boolean(hasShelves),
  shelfCount: hasShelves && shelfCount ? Number(shelfCount) : null,
},
  })

  res.status(201).json(humidor)
})

app.put('/api/humidors/:id', async (req, res) => {
  const id = Number(req.params.id)
  const { name, capacity, hasShelves, shelfCount } = req.body

  const humidor = await prisma.storageLocation.update({
    where: { id },
    data: {
      name,
      capacity: capacity ? Number(capacity) : null,
      hasShelves: Boolean(hasShelves),
      shelfCount: hasShelves && shelfCount ? Number(shelfCount) : null,
    },
  })

  res.json(humidor)
})

app.patch('/api/humidors/:id/archive', async (req, res) => {
  const id = Number(req.params.id)

  const humidor = await prisma.storageLocation.update({
    where: { id },
    data: {
      isActive: false,
    },
  })

  res.json(humidor)
})

const PORT = 3001

app.listen(PORT, () => {
  console.log(`Humidor HQ API running at http://localhost:${PORT}`)
})
