import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_V2_SETTINGS,
  normalizeSettings,
} from '../src/core/config.mjs';

test('normalizeSettings migrates legacy v1 shape to v2 schema', () => {
  const migrated = normalizeSettings({
    x: { dailyLimitSec: 1800, sessionLimitSec: 900, cooldownSec: 120 },
    instagram: { dailyLimitSec: 1200, sessionLimitSec: 600, cooldownSec: 60 },
  });

  assert.equal(migrated.version, 2);
  assert.equal(Array.isArray(migrated.sites), true);
  assert.equal(migrated.sites.length, 2);
  assert.equal(migrated.sites[0].id, 'x');
  assert.equal(migrated.sites[1].id, 'instagram');
  assert.equal(migrated.sites[0].dailyLimitSec, 1800);
  assert.equal(migrated.sites[1].cooldownSec, 60);
});

test('normalizeSettings keeps valid v2 custom site definitions', () => {
  const normalized = normalizeSettings({
    version: 2,
    sites: [
      {
        id: 'youtube',
        label: 'YouTube',
        domains: ['youtube.com', 'm.youtube.com'],
        dailyLimitSec: 3600,
        sessionLimitSec: 600,
        cooldownSec: 120,
        enabled: true,
      },
    ],
    warning: { enabled: true, thresholdSec: 90, notify: false },
    breakGlass: { enabled: true, pinHash: 'abc', pinSalt: 'salt', durationSec: 300, maxUsesPerDay: 2 },
    ui: { overlayEnabled: false, position: 'bottom-left' },
  });

  assert.equal(normalized.sites.length, 1);
  assert.equal(normalized.sites[0].id, 'youtube');
  assert.equal(normalized.warning.thresholdSec, 90);
  assert.equal(normalized.breakGlass.maxUsesPerDay, 2);
  assert.equal(normalized.ui.position, 'bottom-left');
});

test('normalizeSettings falls back to defaults on malformed v2 payload', () => {
  const normalized = normalizeSettings({ version: 2, sites: [{ id: '', domains: [] }] });

  assert.equal(normalized.version, 2);
  assert.deepEqual(normalized.warning, DEFAULT_V2_SETTINGS.warning);
  assert.equal(normalized.sites.length, DEFAULT_V2_SETTINGS.sites.length);
});
