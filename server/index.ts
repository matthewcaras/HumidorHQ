import express from 'express'
import cors from 'cors'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

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

app.get('/api/humidors', async (_req, res) => {
  const humidors = await prisma.storageLocation.findMany({
    orderBy: { name: 'asc' },
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

const PORT = 3001

app.listen(PORT, () => {
  console.log(`Humidor HQ API running at http://localhost:${PORT}`)
})