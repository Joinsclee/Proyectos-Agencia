import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRateLimit, resetRateLimitsForTests } from './rate-limit.js';

test('limita una ventana y permite de nuevo al expirar', () => {
  resetRateLimitsForTests();
  const policy = { limit: 2, windowMs: 1_000 };
  assert.deepEqual(checkRateLimit('login:ip', policy, 0), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 1,
  });
  assert.equal(checkRateLimit('login:ip', policy, 100).allowed, true);
  const blocked = checkRateLimit('login:ip', policy, 200);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(checkRateLimit('login:ip', policy, 1_001).allowed, true);
});

test('mantiene contadores separados por usuario y acción', () => {
  resetRateLimitsForTests();
  const policy = { limit: 1, windowMs: 10_000 };
  assert.equal(checkRateLimit('alerts:user-a', policy, 0).allowed, true);
  assert.equal(checkRateLimit('alerts:user-a', policy, 1).allowed, false);
  assert.equal(checkRateLimit('alerts:user-b', policy, 1).allowed, true);
});
