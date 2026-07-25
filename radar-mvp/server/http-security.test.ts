import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applySecurityHeaders, contentTypeFor, createRequestId, SECURITY_HEADERS } from './http-security.js';

describe('HTTP security baseline', () => {
  it('returns exact MIME types for public assets', () => {
    assert.equal(contentTypeFor('login-poster.jpg'), 'image/jpeg');
    assert.equal(contentTypeFor('login.mp4'), 'video/mp4');
    assert.equal(contentTypeFor('app.js'), 'text/javascript; charset=utf-8');
    assert.equal(contentTypeFor('styles.css'), 'text/css; charset=utf-8');
    assert.equal(contentTypeFor('unknown.bin'), 'application/octet-stream');
  });

  it('sets the common security headers and a request id', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    };

    applySecurityHeaders(response as never, 'request-123');

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.equal(headers.get(name), value);
    }
    const csp = headers.get('Content-Security-Policy') ?? '';
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(headers.get('X-Request-Id'), 'request-123');
  });

  it('creates opaque request ids', () => {
    const first = createRequestId();
    const second = createRequestId();
    assert.match(first, /^[0-9a-f-]{36}$/);
    assert.notEqual(first, second);
  });
});
