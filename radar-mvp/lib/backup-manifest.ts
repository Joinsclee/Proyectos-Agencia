import { relative, resolve } from 'node:path';

export interface PostgresEnvironment {
  PGHOST: string;
  PGPORT: string;
  PGUSER: string;
  PGPASSWORD: string;
  PGDATABASE: string;
  PGSSLMODE: string;
}

export interface BackupManifest {
  format: 'postgres-custom';
  createdAt: string;
  filename: string;
  bytes: number;
  sha256: string;
  archiveEntries: number;
  pgDumpVersion: string;
  verifiedWithPgRestore: true;
}

export function postgresEnvironment(databaseUrl: string): PostgresEnvironment {
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('RADAR_DATABASE_URL debe usar postgres:// o postgresql://');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!url.hostname || !url.username || !url.password || !database) {
    throw new Error('RADAR_DATABASE_URL debe incluir host, usuario, contraseña y base');
  }
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
    PGSSLMODE: 'require',
  };
}

export function backupFilename(date: Date): string {
  const stamp = date.toISOString().replace(/[:T.]/g, '-');
  return `radar-${stamp}.dump`;
}

export function assertBackupDirectoryOutsideRepository(directory: string, repository: string): string {
  const absoluteDirectory = resolve(directory);
  const relation = relative(resolve(repository), absoluteDirectory);
  if (relation === '' || (!relation.startsWith('..') && relation !== '..')) {
    throw new Error('RADAR_BACKUP_DIR debe estar fuera del repositorio');
  }
  return absoluteDirectory;
}

export function createBackupManifest(input: Omit<BackupManifest, 'format' | 'verifiedWithPgRestore'>): BackupManifest {
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new Error('SHA-256 inválido');
  if (input.bytes <= 0 || input.archiveEntries <= 0) throw new Error('El backup está vacío');
  return {
    format: 'postgres-custom',
    verifiedWithPgRestore: true,
    ...input,
  };
}
