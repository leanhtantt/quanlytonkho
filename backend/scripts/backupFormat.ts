import { createHash } from 'node:crypto';

export const BACKUP_FORMAT = 'bap-inventory-json-v1';

export type BackupTable = {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

export type DatabaseBackup = {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  source: { host: string; port: string; database: string };
  tableOrder: string[];
  tables: BackupTable[];
  rowCount: number;
  checksum: string;
};

export function quoteIdentifier(value: string): string {
  return '"' + value.replaceAll('"', '""') + '"';
}

export function calculateChecksum(tableOrder: string[], tables: BackupTable[]): string {
  return createHash('sha256').update(JSON.stringify({ tableOrder, tables })).digest('hex');
}

export function validateBackup(value: unknown): DatabaseBackup {
  if (!value || typeof value !== 'object') throw new Error('Backup is not a JSON object.');
  const backup = value as Partial<DatabaseBackup>;
  if (backup.format !== BACKUP_FORMAT || !Array.isArray(backup.tables)) {
    throw new Error('Unsupported backup format. Expected ' + BACKUP_FORMAT + '.');
  }
  if (!Array.isArray(backup.tableOrder)) throw new Error('Backup table order is missing.');
  const tableNames = new Set(backup.tables.map((table) => table.name));
  if (backup.tableOrder.some((table) => !tableNames.has(table))) throw new Error('Backup table order references a missing table.');
  for (const table of backup.tables) {
    if (!Array.isArray(table.columns) || !Array.isArray(table.rows)) throw new Error('Invalid data for table ' + table.name + '.');
  }
  const rowCount = backup.tables.reduce((sum, table) => sum + table.rows.length, 0);
  if (backup.rowCount !== rowCount) throw new Error('Row count mismatch: metadata=' + backup.rowCount + ', actual=' + rowCount + '.');
  const checksum = calculateChecksum(backup.tableOrder, backup.tables);
  if (backup.checksum !== checksum) throw new Error('Backup checksum mismatch. The file may be incomplete or modified.');
  return backup as DatabaseBackup;
}
