import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSiteMatchers, getMatchedSiteFromUrl } from '../src/core/sites.mjs';

test('compileSiteMatchers matches default and custom domains', () => {
  const matchers = compileSiteMatchers([
    { id: 'x', label: 'X', domains: ['x.com', 'twitter.com'], enabled: true },
    { id: 'youtube', label: 'YouTube', domains: ['youtube.com'], enabled: true },
  ]);

  assert.equal(getMatchedSiteFromUrl('https://x.com/home', matchers)?.id, 'x');
  assert.equal(getMatchedSiteFromUrl('https://mobile.twitter.com/home', matchers)?.id, 'x');
  assert.equal(getMatchedSiteFromUrl('https://www.youtube.com/watch?v=1', matchers)?.id, 'youtube');
});

test('compileSiteMatchers ignores disabled sites', () => {
  const matchers = compileSiteMatchers([
    { id: 'x', label: 'X', domains: ['x.com'], enabled: false },
  ]);

  assert.equal(getMatchedSiteFromUrl('https://x.com/home', matchers), null);
});

test('getMatchedSiteFromUrl safely handles invalid URLs', () => {
  const matchers = compileSiteMatchers([{ id: 'x', label: 'X', domains: ['x.com'], enabled: true }]);
  assert.equal(getMatchedSiteFromUrl('not-a-url', matchers), null);
});
