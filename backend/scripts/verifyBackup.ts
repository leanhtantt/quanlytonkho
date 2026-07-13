import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateBackup } from './backupFormat';

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: npm run db:backup:verify -- <backup-file>');
  const file = path.resolve(input);
  const backup = validateBackup(JSON.parse(await readFile(file, 'utf8')));
  console.log('Backup valid: ' + file);
  console.log('Created: ' + backup.createdAt + '; tables: ' + backup.tables.length + '; rows: ' + backup.rowCount);
  console.log('Checksum: ' + backup.checksum);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
