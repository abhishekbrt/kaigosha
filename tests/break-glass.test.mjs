import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activateBreakGlass,
  canActivateBreakGlass,
  createInitialBreakGlassRuntime,
  isBreakGlassActive,
  normalizeBreakGlassRuntime,
} from '../src/core/break-glass.mjs';

const BREAK_GLASS_CONFIG = {
  enabled: true,
  durationSec: 300,
  maxUsesPerDay: 2,
};

function at(isoDate) {
  return new Date(isoDate).getTime();
}

test('initial runtime starts with no active unlock', () => {
  const runtime = createInitialBreakGlassRuntime(at('2026-02-12T09:00:00.000Z'));

  assert.equal(runtime.active, null);
  assert.equal(runtime.usage.count, 0);
});

test('activateBreakGlass creates active window and increments usage', () => {
  const now = at('2026-02-12T09:00:00.000Z');
  const runtime = createInitialBreakGlassRuntime(now);

  const next = activateBreakGlass(runtime, BREAK_GLASS_CONFIG, 'x', now);

  assert.equal(next.active.siteId, 'x');
  assert.equal(next.active.untilTs, now + 300000);
  assert.equal(next.usage.count, 1);
  assert.equal(isBreakGlassActive(next, 'x', now + 1000), true);
});

test('canActivateBreakGlass denies activation after daily usage cap', () => {
  const now = at('2026-02-12T20:00:00.000Z');
  const baseline = createInitialBreakGlassRuntime(now);
  const runtime = {
    active: null,
    usage: {
      dayKey: baseline.usage.dayKey,
      count: 2,
    },
  };

  assert.equal(canActivateBreakGlass(runtime, BREAK_GLASS_CONFIG, now), false);
});

test('normalizeBreakGlassRuntime resets usage on day rollover', () => {
  const runtime = normalizeBreakGlassRuntime(
    {
      active: null,
      usage: { dayKey: '2026-02-12', count: 2 },
    },
    at('2026-02-13T00:01:00.000Z')
  );

  assert.equal(runtime.usage.dayKey, '2026-02-13');
  assert.equal(runtime.usage.count, 0);
});
