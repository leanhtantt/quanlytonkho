import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { quoteIdentifier, validateBackup } from './backupFormat';

function databaseIdentity(value: string): string {
  const url = new URL(value);
  return url.hostname.toLowerCase() + ':' + (url.port || '5432') + '/' + url.pathname.slice(1);
}

async function main() {
  const input = process.argv[2];
  const targetUrl = process.env.RESTORE_DATABASE_URL;
  if (!input) throw new Error('Usage: RESTORE_DATABASE_URL=... npm run db:restore -- <backup-file>');
  if (!targetUrl) throw new Error('RESTORE_DATABASE_URL is required. Restore is never allowed through DATABASE_URL.');
  if (process.env.DATABASE_URL && databaseIdentity(targetUrl) === databaseIdentity(process.env.DATABASE_URL)) throw new Error('Refusing to restore into DATABASE_URL. Use a separate, empty restore-test database.');
  const backup = validateBackup(JSON.parse(await readFile(path.resolve(input), 'utf8')));
  const targetIdentity = databaseIdentity(targetUrl);
  const expectedConfirmation = 'RESTORE ' + targetIdentity;
  if (process.env.RESTORE_CONFIRM !== expectedConfirmation) throw new Error('Set RESTORE_CONFIRM exactly to: ' + expectedConfirmation);
  const client = new Client({ connectionString: targetUrl });
  await client.connect();
  try {
    const targetResult = await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'");
    const targetTables = new Set(targetResult.rows.map((row) => row.table_name));
    const missingTables = backup.tableOrder.filter((table) => !targetTables.has(table));
    if (missingTables.length > 0) throw new Error('Target database is not migrated. Missing tables: ' + missingTables.join(', '));
    for (const tableName of backup.tableOrder) {
      const countResult = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM public.' + quoteIdentifier(tableName));
      if (countResult.rows[0]?.count !== '0') throw new Error('Target table ' + tableName + ' is not empty.');
    }
    await client.query('BEGIN');
    for (const tableName of backup.tableOrder) {
      const table = backup.tables.find((item) => item.name === tableName);
      if (!table || table.rows.length === 0) continue;
      const typeResult = await client.query<{ column_name: string; data_type: string }>(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [tableName],
      );
      const columnTypes = new Map(typeResult.rows.map((column) => [column.column_name, column.data_type]));
      const columnSql = table.columns.map(quoteIdentifier).join(', ');
      const placeholders = table.columns.map((_, index) => '$' + (index + 1)).join(', ');
      const insertSql = 'INSERT INTO public.' + quoteIdentifier(tableName) + ' (' + columnSql + ') VALUES (' + placeholders + ')';
      for (const row of table.rows) {
        const values = table.columns.map((column) => {
          const value = row[column];
          const type = columnTypes.get(column);
          return (type === 'json' || type === 'jsonb') && value !== null && typeof value !== 'string'
            ? JSON.stringify(value)
            : value;
        });
        await client.query(insertSql, values);
      }
    }
    await client.query('COMMIT');
    for (const table of backup.tables) {
      const countResult = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM public.' + quoteIdentifier(table.name));
      if (Number(countResult.rows[0]?.count) !== table.rows.length) throw new Error('Restore count mismatch for ' + table.name + '.');
    }
    console.log('Restore verified: ' + backup.tables.length + ' tables, ' + backup.rowCount + ' rows into ' + targetIdentity);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
