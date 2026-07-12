import express from 'express'
import cors from 'cors'
import {
  archiveCatalogCigar,
  CatalogServiceError,
  createCatalogCigar,
  getCatalogCigars,
  updateCatalogCigar,
} from './services/catalogService.ts'
import {
  archiveHumidor,
  createHumidor,
  getHumidors,
  HumidorServiceError,
  humidorIdParam,
  updateHumidor,
} from './services/humidorService.ts'
import {
  archiveVendor,
  createVendor,
  getVendors,
  updateVendor,
  VendorServiceError,
  vendorIdParam,
} from './services/vendorService.ts'
import {
  createPurchase,
  getPurchaseById,
  getPurchases,
  purchaseIdParam,
  PurchaseServiceError,
} from './services/purchaseService.ts'
import {
  receiveAndStorePurchaseLine,
  ReceiveStoreServiceError,
  purchaseLineIdParam,
} from './services/receiveStoreService.ts'

const app = express()

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

function handleHumidorError(error: unknown, res: express.Response) {
  if (error instanceof HumidorServiceError) {
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
      code: 'HUMIDOR_UNEXPECTED_ERROR',
      message: 'The humidor request could not be completed.',
    },
  })
}

function handleVendorError(error: unknown, res: express.Response) {
  if (error instanceof VendorServiceError) {
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
      code: 'VENDOR_UNEXPECTED_ERROR',
      message: 'The vendor request could not be completed.',
    },
  })
}

function handlePurchaseError(error: unknown, res: express.Response) {
  if (error instanceof PurchaseServiceError) {
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
      code: 'PURCHASE_UNEXPECTED_ERROR',
      message: 'The purchase request could not be completed.',
    },
  })
}

function handleReceiveStoreError(error: unknown, res: express.Response) {
  if (error instanceof ReceiveStoreServiceError) {
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
      code: 'RECEIVE_STORE_UNEXPECTED_ERROR',
      message: 'The receive and store request could not be completed.',
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

app.get('/api/vendors', async (req, res) => {
  try {
    const vendors = await getVendors({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    })
    res.json({ data: vendors })
  } catch (error) {
    handleVendorError(error, res)
  }
})

app.post('/api/vendors', async (req, res) => {
  try {
    const vendor = await createVendor(req.body)
    res.status(201).json({ data: vendor })
  } catch (error) {
    handleVendorError(error, res)
  }
})

app.put('/api/vendors/:id', async (req, res) => {
  try {
    const vendor = await updateVendor(vendorIdParam(req.params.id), req.body)
    res.json({ data: vendor })
  } catch (error) {
    handleVendorError(error, res)
  }
})

app.patch('/api/vendors/:id/archive', async (req, res) => {
  try {
    const vendor = await archiveVendor(vendorIdParam(req.params.id))
    res.json({ data: vendor })
  } catch (error) {
    handleVendorError(error, res)
  }
})

app.get('/api/purchases', async (req, res) => {
  try {
    const purchases = await getPurchases({
      vendorId: typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    })
    res.json({ data: purchases })
  } catch (error) {
    handlePurchaseError(error, res)
  }
})

app.get('/api/purchases/:id', async (req, res) => {
  try {
    const purchase = await getPurchaseById(purchaseIdParam(req.params.id))
    res.json({ data: purchase })
  } catch (error) {
    handlePurchaseError(error, res)
  }
})

app.post('/api/purchases', async (req, res) => {
  try {
    const purchase = await createPurchase(req.body)
    res.status(201).json({ data: purchase })
  } catch (error) {
    handlePurchaseError(error, res)
  }
})

app.post('/api/purchase-lines/:id/receive-store', async (req, res) => {
  try {
    const result = await receiveAndStorePurchaseLine(
      purchaseLineIdParam(req.params.id),
      req.body,
    )
    res.json({ data: result })
  } catch (error) {
    handleReceiveStoreError(error, res)
  }
})

app.get('/api/humidors', async (_req, res) => {
  try {
    const humidors = await getHumidors()
    res.json({ data: humidors })
  } catch (error) {
    handleHumidorError(error, res)
  }
})

app.post('/api/humidors', async (req, res) => {
  try {
    const humidor = await createHumidor(req.body)
    res.status(201).json({ data: humidor })
  } catch (error) {
    handleHumidorError(error, res)
  }
})

app.put('/api/humidors/:id', async (req, res) => {
  try {
    const humidor = await updateHumidor(humidorIdParam(req.params.id), req.body)
    res.json({ data: humidor })
  } catch (error) {
    handleHumidorError(error, res)
  }
})

app.patch('/api/humidors/:id/archive', async (req, res) => {
  try {
    const humidor = await archiveHumidor(humidorIdParam(req.params.id))
    res.json({ data: humidor })
  } catch (error) {
    handleHumidorError(error, res)
  }
})

const PORT = 3001

app.listen(PORT, () => {
  console.log(`Humidor HQ API running at http://localhost:${PORT}`)
})
