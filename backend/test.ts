import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const p = await prisma.purchaseOrder.findFirst({
    where: { code: "16" },
    include: { purchaseItems: { include: { inventoryBatches: true } } }
  });
  console.log(JSON.stringify(p, null, 2));
}
main();
