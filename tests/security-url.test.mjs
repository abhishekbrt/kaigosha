import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeReturnUrl } from '../src/core/security.mjs';

test('sanitizeReturnUrl allows http/https URLs on allowed domains', () => {
  const safe = sanitizeReturnUrl('https://x.com/home', ['x.com', 'twitter.com']);
  assert.equal(safe, 'https://x.com/home');

  const safeSubdomain = sanitizeReturnUrl('https://mobile.twitter.com/home', ['x.com', 'twitter.com']);
  assert.equal(safeSubdomain, 'https://mobile.twitter.com/home');
});

test('sanitizeReturnUrl rejects javascript/data/file schemes', () => {
  assert.equal(sanitizeReturnUrl('javascript:alert(1)', ['x.com']), null);
  assert.equal(sanitizeReturnUrl('data:text/html,boom', ['x.com']), null);
  assert.equal(sanitizeReturnUrl('file:///etc/passwd', ['x.com']), null);
});

test('sanitizeReturnUrl rejects domains outside allowed list', () => {
  assert.equal(sanitizeReturnUrl('https://example.com', ['x.com']), null);
});
