import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  secondsFromMinutes,
} from '../src/core/config.mjs';

test('default settings provide per-site limits', () => {
  assert.deepEqual(DEFAULT_SETTINGS.x, {
    dailyLimitSec: 1800,
    sessionLimitSec: 600,
    cooldownSec: 120,
  });
  assert.deepEqual(DEFAULT_SETTINGS.instagram, {
    dailyLimitSec: 1800,
    sessionLimitSec: 600,
    cooldownSec: 120,
  });
});

test('normalizeSettings falls back to defaults on invalid input', () => {
  const normalized = normalizeSettings({
    x: {
      dailyLimitSec: -1,
      sessionLimitSec: 9000,
      cooldownSec: 0,
    },
  });

  assert.deepEqual(normalized, DEFAULT_SETTINGS);
});

test('normalizeSettings accepts valid per-site overrides', () => {
  const normalized = normalizeSettings({
    x: {
      dailyLimitSec: 1200,
      sessionLimitSec: 300,
      cooldownSec: 180,
    },
    instagram: {
      dailyLimitSec: 600,
      sessionLimitSec: 300,
      cooldownSec: 60,
    },
  });

  assert.equal(normalized.x.dailyLimitSec, 1200);
  assert.equal(normalized.instagram.cooldownSec, 60);
});

test('secondsFromMinutes converts whole minutes safely', () => {
  assert.equal(secondsFromMinutes('10'), 600);
  assert.equal(secondsFromMinutes('0'), null);
  assert.equal(secondsFromMinutes('abc'), null);
});
