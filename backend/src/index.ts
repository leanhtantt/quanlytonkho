import express from 'express';
import cors from 'cors';
import { prisma } from './prismaClient';
import { createPurchaseOrder } from './services/procurementService';
import { deductStockFIFO } from './services/inventoryService';
import { requireAuth } from './middlewares/authMiddleware';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Products API
app.get('/api/products', requireAuth, async (req, res) => {
  const products = await prisma.product.findMany();
  res.json(products);
});

app.post('/api/products', requireAuth, async (req, res) => {
  const product = await prisma.product.create({ data: req.body });
  res.json(product);
});

// Purchases (Procurement) API
app.post('/api/purchases', requireAuth, async (req, res) => {
  try {
    const po = await createPurchaseOrder(req.body);
    res.json(po);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Orders & FIFO Sales
app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const { channel, externalCode, orderedAt, items } = req.body;
    
    // 1. Create order
    const order = await prisma.order.create({
      data: {
        channel,
        externalCode,
        orderedAt: new Date(orderedAt),
        status: 'SHIPPING', // default
        expectedRevenue: items.reduce((sum: number, it: any) => sum + it.qty * it.sellingPrice, 0)
      }
    });

    // 2. Add order items & deduct stock via FIFO
    let totalCogs = 0;
    for (const item of items) {
      // Deduct from Inventory
      const fifoResult = await deductStockFIFO(item.productId, item.qty, 'ORDER', order.id);
      totalCogs += fifoResult.totalCogs;

      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId,
          qty: item.qty,
          sellingPrice: item.sellingPrice
        }
      });
    }

    // Optional: Record ledger entry for the expected revenue or COGS
    await prisma.ledgerEntry.create({
      data: {
        account: 'COGS',
        direction: 'DEBIT',
        amount: totalCogs,
        referenceType: 'ORDER',
        referenceId: order.id
      }
    });

    res.json(order);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
