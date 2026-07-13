import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { prisma } from '../src/prismaClient';

const WIPE_FLAG = '--allow-destructive-wipe';

function getTargetName(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const url = new URL(databaseUrl);
  return 'tanle-dev/' + url.pathname.slice(1);
}

async function main() {
  if (!process.argv.includes(WIPE_FLAG)) {
    throw new Error('Database wipe is locked. Re-run with ' + WIPE_FLAG + ' only when deletion is intentional.');
  }
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Database wipe requires an interactive terminal. Piped or automated execution is blocked.');
  }

  const targetName = getTargetName();
  const prompt = createInterface({ input: stdin, output: stdout });
  const confirmation = await prompt.question(
    'This permanently deletes inventory data from ' + targetName +
    '. Type the exact project/database name to continue: ',
  );
  prompt.close();
  if (confirmation !== targetName) throw new Error('Confirmation did not match. Database was not changed.');

  console.log('Wiping ' + targetName + '...');
  await prisma.stockTransaction.deleteMany();
  await prisma.inventoryBatch.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.product.deleteMany();
  console.log('Database wiped.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
