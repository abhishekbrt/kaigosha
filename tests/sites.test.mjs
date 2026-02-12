import test from 'node:test';
import assert from 'node:assert/strict';

import { getSiteKeyFromUrl, isTrackedSiteUrl } from '../src/core/sites.mjs';

test('maps X and Twitter hosts to x site key', () => {
  assert.equal(getSiteKeyFromUrl('https://x.com/home'), 'x');
  assert.equal(getSiteKeyFromUrl('https://mobile.x.com/home'), 'x');
  assert.equal(getSiteKeyFromUrl('https://twitter.com/home'), 'x');
});

test('maps Instagram hosts to instagram site key', () => {
  assert.equal(getSiteKeyFromUrl('https://www.instagram.com/'), 'instagram');
  assert.equal(getSiteKeyFromUrl('https://instagram.com/reels/abc'), 'instagram');
});

test('returns null for non-tracked URLs', () => {
  assert.equal(getSiteKeyFromUrl('https://example.com'), null);
  assert.equal(getSiteKeyFromUrl('not-a-url'), null);
  assert.equal(isTrackedSiteUrl('https://news.ycombinator.com'), false);
});
