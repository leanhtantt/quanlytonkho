import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { BACKUP_FORMAT, BackupTable, calculateChecksum, quoteIdentifier } from './backupFormat';

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  return databaseUrl;
}

function timestampForFile(date: Date): string {
  return date.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
}

async function getTableOrder(client: Client): Promise<string[]> {
  const tableResult = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name",
  );
  const tables = tableResult.rows.map((row) => row.table_name);
  const dependencyResult = await client.query<{ child: string; parent: string }>(
    "SELECT child.relname AS child, parent.relname AS parent FROM pg_constraint constraint_info JOIN pg_class child ON child.oid = constraint_info.conrelid JOIN pg_class parent ON parent.oid = constraint_info.confrelid JOIN pg_namespace namespace_info ON namespace_info.oid = child.relnamespace WHERE constraint_info.contype = 'f' AND namespace_info.nspname = 'public'",
  );
  const tableSet = new Set(tables);
  const dependencies = new Map(tables.map((table) => [table, new Set<string>()]));
  for (const { child, parent } of dependencyResult.rows) {
    if (tableSet.has(child) && tableSet.has(parent) && child !== parent) dependencies.get(child)?.add(parent);
  }
  const ordered: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining].filter((table) => [...(dependencies.get(table) ?? [])].every((item) => !remaining.has(item))).sort();
    if (ready.length === 0) throw new Error('Cannot determine restore order for: ' + [...remaining].join(', '));
    for (const table of ready) { ordered.push(table); remaining.delete(table); }
  }
  return ordered;
}

async function main() {
  const databaseUrl = requireDatabaseUrl();
  const sourceUrl = new URL(databaseUrl);
  const outputDirectory = path.resolve(process.argv[2] ?? 'backups');
  const createdAt = new Date();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tableOrder = await getTableOrder(client);
    const tables: BackupTable[] = [];
    for (const tableName of tableOrder) {
      const columnResult = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position", [tableName]);
      const columns = columnResult.rows.map((row) => row.column_name);
      const result = await client.query<Record<string, unknown>>('SELECT * FROM public.' + quoteIdentifier(tableName));
      tables.push({ name: tableName, columns, rows: result.rows });
    }
    await client.query('COMMIT');
    const rowCount = tables.reduce((sum, table) => sum + table.rows.length, 0);
    const backup = { format: BACKUP_FORMAT, createdAt: createdAt.toISOString(), source: { host: sourceUrl.hostname, port: sourceUrl.port || '5432', database: sourceUrl.pathname.slice(1) }, tableOrder, tables, rowCount, checksum: calculateChecksum(tableOrder, tables) };
    await mkdir(outputDirectory, { recursive: true });
    const outputFile = path.join(outputDirectory, 'bap-inventory-' + timestampForFile(createdAt) + '.json');
    await writeFile(outputFile, JSON.stringify(backup, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Backup created: ' + outputFile);
    console.log('Tables: ' + tables.length + '; rows: ' + rowCount + '; checksum: ' + backup.checksum);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
