import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  assertBackupDirectoryOutsideRepository,
  backupFilename,
  createBackupManifest,
  postgresEnvironment,
} from './backup-manifest.js';

describe('backup seguro de Supabase', () => {
  test('convierte la URL en variables PG sin conservarla completa', () => {
    const env = postgresEnvironment('postgresql://radar:p%40ss@db.example.test:6543/postgres?sslmode=require');
    assert.deepEqual(env, {
      PGHOST: 'db.example.test',
      PGPORT: '6543',
      PGUSER: 'radar',
      PGPASSWORD: 'p@ss',
      PGDATABASE: 'postgres',
      PGSSLMODE: 'require',
    });
    assert.equal(JSON.stringify(env).includes('postgresql://'), false);
  });

  test('rechaza URLs incompletas o de protocolos diferentes', () => {
    assert.throws(() => postgresEnvironment('https://db.example.test/postgres'), /postgres/);
    assert.throws(() => postgresEnvironment('postgresql://radar@db.example.test/postgres'), /contraseña/);
  });

  test('genera nombres reproducibles sin espacios', () => {
    assert.equal(
      backupFilename(new Date('2026-07-25T14:03:02.123Z')),
      'radar-2026-07-25-14-03-02-123Z.dump',
    );
  });

  test('obliga a guardar el archivo fuera del repositorio', () => {
    assert.throws(
      () => assertBackupDirectoryOutsideRepository('/workspace/radar/backups', '/workspace/radar'),
      /fuera del repositorio/,
    );
    assert.equal(
      assertBackupDirectoryOutsideRepository('/secure/radar-backups', '/workspace/radar'),
      '/secure/radar-backups',
    );
  });

  test('solo certifica manifiestos con contenido y checksum válido', () => {
    const manifest = createBackupManifest({
      createdAt: '2026-07-25T14:03:02.000Z',
      filename: 'radar.dump',
      bytes: 123,
      sha256: 'a'.repeat(64),
      archiveEntries: 20,
      pgDumpVersion: 'pg_dump (PostgreSQL) 17.5',
    });
    assert.equal(manifest.verifiedWithPgRestore, true);
    assert.throws(() => createBackupManifest({ ...manifest, bytes: 0 }), /vacío/);
  });
});
