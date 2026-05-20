import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROYECTO = resolve(__dirname, '..');
const DESTINO = join(PROYECTO, '.chrome-profile-auto');
const ORIGEN_BASE = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');

const EXCLUSIONES = [
  'Default/Cache',
  'Default/Code Cache',
  'Default/GPUCache',
  'Default/Service Worker/CacheStorage',
  'Default/Service Worker/ScriptCache',
  'Default/Application Cache',
  'Default/File System',
  'Default/IndexedDB/*-shm',
  'Default/IndexedDB/*-wal',
  'ShaderCache',
  'GraphiteDawnCache',
  'GrShaderCache',
  'component_crx_cache',
  'optimization_guide_model_store',
  'Crashpad',
  'Safe Browsing',
  'SafetyTips',
  'OnDeviceHeadSuggestModel',
  'SSLErrorAssistant',
  'CertificateRevocation',
  'OriginTrials',
  'PKIMetadata',
  'segmentation_platform',
  'Subresource Filter',
  'TrustTokenKeyCommitments',
  'ZxcvbnData',
  'Singleton*',
];

function chequeoChromeAbierto(): void {
  try {
    const salida = execSync('pgrep -x "Google Chrome" || true', { encoding: 'utf8' }).trim();
    if (salida) {
      console.error(
        '\nERROR: Chrome esta abierto. Cierralo completamente (Cmd+Q) antes de clonar el perfil.\n' +
        'Esto es necesario para que las cookies y la base de datos no se copien corruptas.\n'
      );
      process.exit(1);
    }
  } catch {
    // pgrep no encontrado o sin coincidencias: ok
  }
}

function clonar(): void {
  if (!existsSync(ORIGEN_BASE)) {
    console.error(`No se encontro el perfil de Chrome en: ${ORIGEN_BASE}`);
    process.exit(1);
  }

  if (existsSync(DESTINO)) {
    console.log(`Ya existe ${DESTINO}. Sincronizando cambios incrementalmente...`);
  } else {
    mkdirSync(DESTINO, { recursive: true });
    console.log(`Creando clon en ${DESTINO}...`);
  }

  const argsExcluir = EXCLUSIONES.map((p) => `--exclude=${JSON.stringify(p)}`).join(' ');
  const cmd = `rsync -a --delete ${argsExcluir} ${JSON.stringify(ORIGEN_BASE + '/')} ${JSON.stringify(DESTINO + '/')}`;

  console.log('Copiando con rsync (puede tardar un par de minutos la primera vez)...');
  execSync(cmd, { stdio: 'inherit' });

  console.log('\nClon listo. Para abrir Chrome con este perfil ejecuta:\n  npm run abrir\n');
}

chequeoChromeAbierto();
clonar();
