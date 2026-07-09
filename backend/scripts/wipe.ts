import { prisma } from '../src/prismaClient';

async function main() {
  console.log('Wiping database...');
  await prisma.stockTransaction.deleteMany();
  await prisma.inventoryBatch.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.product.deleteMany();
  console.log('Database wiped.');
}

main().finally(() => prisma.$disconnect());
