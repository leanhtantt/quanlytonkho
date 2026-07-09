const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Products:', await prisma.product.count());
  console.log('Purchase Orders:', await prisma.purchaseOrder.count());
  console.log('Purchase Items:', await prisma.purchaseItem.count());
  console.log('Inventory Batches:', await prisma.inventoryBatch.count());
  console.log('Stock Transactions:', await prisma.stockTransaction.count());
}

main().finally(() => prisma.$disconnect());
