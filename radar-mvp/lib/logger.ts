import { env } from './env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const ICONS: Record<Level, string> = { debug: '·', info: '▸', warn: '⚠', error: '✖' };

function ts(): string {
  return new Date().toISOString();
}

function shouldLog(level: Level): boolean {
  return ORDER[level] >= ORDER[env.SCRAPE_LOG_LEVEL];
}

/**
 * Serializa el `extra` del log. OJO: `JSON.stringify(new Error('x'))` devuelve
 * `{}` porque message/stack NO son enumerables — por eso los fallos salían como
 * "Failed {}" (inservible). Los Error se formatean explícitamente.
 */
function serialize(extra: unknown): string {
  if (typeof extra === 'string') return extra;
  if (extra instanceof Error) {
    const cause = (extra as any).cause;
    const first = extra.stack?.split('\n')[1]?.trim();
    return `${extra.name}: ${extra.message}` +
      (cause ? ` · causa: ${cause instanceof Error ? cause.message : String(cause)}` : '') +
      (first ? ` (${first})` : '');
  }
  try { return JSON.stringify(extra); } catch { return String(extra); }
}

function fmt(scope: string, level: Level, msg: string, extra?: unknown): string {
  const base = `${ts()} ${ICONS[level]} [${scope}] ${msg}`;
  if (extra === undefined) return base;
  return `${base} ${serialize(extra)}`;
}

export interface Logger {
  debug: (msg: string, extra?: unknown) => void;
  info: (msg: string, extra?: unknown) => void;
  warn: (msg: string, extra?: unknown) => void;
  error: (msg: string, extra?: unknown) => void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, extra) => shouldLog('debug') && console.log(fmt(scope, 'debug', msg, extra)),
    info: (msg, extra) => shouldLog('info') && console.log(fmt(scope, 'info', msg, extra)),
    warn: (msg, extra) => shouldLog('warn') && console.warn(fmt(scope, 'warn', msg, extra)),
    error: (msg, extra) => shouldLog('error') && console.error(fmt(scope, 'error', msg, extra)),
  };
}
