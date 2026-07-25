import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertBackupDirectoryOutsideRepository,
  backupFilename,
  createBackupManifest,
  postgresEnvironment,
} from '../lib/backup-manifest.js';
import { isEntrypoint } from '../lib/is-main.js';

interface CommandResult {
  stdout: string;
  stderr: string;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function command(commandName: string, args: string[], env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(commandName, args, {
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) return resolveCommand({ stdout, stderr });
      reject(new Error(`${commandName} terminó con código ${code}: ${stderr.trim()}`));
    });
  });
}

async function toolVersion(name: 'pg_dump' | 'pg_restore'): Promise<string> {
  const result = await command(name, ['--version']);
  return result.stdout.trim();
}

async function verifyArchive(archive: string): Promise<number> {
  const result = await command('pg_restore', ['--list', archive]);
  return result.stdout.split('\n')
    .filter(line => line.trim() && !line.trimStart().startsWith(';'))
    .length;
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function preflight(): Promise<void> {
  const [dumpVersion, restoreVersion] = await Promise.all([
    toolVersion('pg_dump'),
    toolVersion('pg_restore'),
  ]);
  const backupDirectory = process.env.RADAR_BACKUP_DIR
    ? assertBackupDirectoryOutsideRepository(process.env.RADAR_BACKUP_DIR, repositoryRoot)
    : null;
  console.log(JSON.stringify({
    ok: true,
    pgDumpVersion: dumpVersion,
    pgRestoreVersion: restoreVersion,
    databaseConfigured: Boolean(process.env.RADAR_DATABASE_URL),
    backupDirectoryConfigured: Boolean(backupDirectory),
    backupDirectory,
  }, null, 2));
}

async function createBackup(): Promise<void> {
  if (!process.env.RADAR_DATABASE_URL) throw new Error('Falta RADAR_DATABASE_URL');
  if (!process.env.RADAR_BACKUP_DIR) throw new Error('Falta RADAR_BACKUP_DIR');

  const backupDirectory = assertBackupDirectoryOutsideRepository(
    process.env.RADAR_BACKUP_DIR,
    repositoryRoot,
  );
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const verifiedBackupDirectory = assertBackupDirectoryOutsideRepository(
    await realpath(backupDirectory),
    await realpath(repositoryRoot),
  );
  const createdAt = new Date();
  const archive = resolve(verifiedBackupDirectory, backupFilename(createdAt));
  const pgEnvironment = postgresEnvironment(process.env.RADAR_DATABASE_URL);
  const { RADAR_DATABASE_URL: _databaseUrl, ...safeProcessEnvironment } = process.env;
  const childEnvironment = { ...safeProcessEnvironment, ...pgEnvironment };
  const dumpVersion = await toolVersion('pg_dump');

  try {
    await command('pg_dump', [
      '--format=custom',
      '--compress=9',
      '--no-owner',
      '--no-privileges',
      `--file=${archive}`,
    ], childEnvironment);
    const archiveEntries = await verifyArchive(archive);
    const fileStat = await stat(archive);
    const manifest = createBackupManifest({
      createdAt: createdAt.toISOString(),
      filename: basename(archive),
      bytes: fileStat.size,
      sha256: await sha256(archive),
      archiveEntries,
      pgDumpVersion: dumpVersion,
    });
    const manifestPath = `${archive}.manifest.json`;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ ok: true, archive, manifest: manifestPath, ...manifest }, null, 2));
  } catch (error) {
    await rm(archive, { force: true });
    throw error;
  }
}

async function verifyBackup(pathInput: string): Promise<void> {
  const archive = resolve(pathInput);
  const manifestPath = `${archive}.manifest.json`;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { sha256?: string };
  const currentHash = await sha256(archive);
  if (!manifest.sha256 || manifest.sha256 !== currentHash) {
    throw new Error('El checksum del backup no coincide con el manifiesto');
  }
  const archiveEntries = await verifyArchive(archive);
  if (archiveEntries <= 0) throw new Error('El archivo no contiene entradas restaurables');
  console.log(JSON.stringify({
    ok: true,
    archive: basename(archive),
    manifestDirectory: dirname(manifestPath),
    sha256Verified: true,
    archiveEntries,
  }, null, 2));
}

async function main(): Promise<void> {
  const [action = 'preflight', argument] = process.argv.slice(2);
  if (action === 'preflight') return preflight();
  if (action === 'create') return createBackup();
  if (action === 'verify' && argument) return verifyBackup(argument);
  throw new Error('Uso: backup-supabase.ts preflight | create | verify <archivo.dump>');
}

if (isEntrypoint(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
