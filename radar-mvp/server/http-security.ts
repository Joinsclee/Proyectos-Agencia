import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { extname } from 'node:path';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' https://fonts.gstatic.com",
  "form-action 'self' https://checkout.wompi.co",
  'frame-ancestors \'none\'',
  'frame-src https://www.google.com',
  "img-src 'self' data: https:",
  "media-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
].join('; ');

/**
 * Cabeceras seguras que no dependen del proxy de despliegue. La política CSP
 * mantiene los scripts en el mismo origen; `unsafe-inline` solo queda en estilos
 * porque las tres páginas aún conservan CSS embebido y atributos de presentación.
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=15552000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function contentTypeFor(file: string): string {
  return MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export function createRequestId(): string {
  return randomUUID();
}

export function applySecurityHeaders(res: ServerResponse, requestId: string): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  res.setHeader('X-Request-Id', requestId);
}

export function allowCrossOriginImageEmbedding(res: ServerResponse, contentType: string): void {
  if (contentType.startsWith('image/')) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}
