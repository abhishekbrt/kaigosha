import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLegacySettingsMap,
  DEFAULT_SETTINGS,
  DEFAULT_V2_SETTINGS,
  normalizeSettings,
  secondsFromMinutes,
} from '../src/core/config.mjs';

test('default legacy map keeps per-site limits for compatibility', () => {
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

test('normalizeSettings falls back to v2 defaults on invalid input', () => {
  const normalized = normalizeSettings({
    x: {
      dailyLimitSec: -1,
      sessionLimitSec: 9000,
      cooldownSec: 0,
    },
  });

  assert.deepEqual(normalized, DEFAULT_V2_SETTINGS);
});

test('normalizeSettings accepts valid legacy per-site overrides and migrates to v2', () => {
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

  const legacyMap = buildLegacySettingsMap(normalized);
  assert.equal(legacyMap.x.dailyLimitSec, 1200);
  assert.equal(legacyMap.instagram.cooldownSec, 60);
  assert.equal(normalized.version, 2);
});

test('secondsFromMinutes converts whole minutes safely', () => {
  assert.equal(secondsFromMinutes('10'), 600);
  assert.equal(secondsFromMinutes('0'), null);
  assert.equal(secondsFromMinutes('abc'), null);
});
