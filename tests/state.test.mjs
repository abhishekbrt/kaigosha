import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyHeartbeat,
  createInitialRuntimeState,
  ensureCurrentDayState,
  getNextLocalMidnightTs,
  isBlocked,
} from '../src/core/state.mjs';

const CONFIG = {
  dailyLimitSec: 30 * 60,
  sessionLimitSec: 10 * 60,
  cooldownSec: 2 * 60,
};

function at(isoDate) {
  return new Date(isoDate).getTime();
}

test('initial runtime state starts in allowed mode', () => {
  const state = createInitialRuntimeState(at('2026-02-12T10:00:00.000Z'));

  assert.equal(state.mode, 'ALLOWED');
  assert.equal(state.dailyUsedSec, 0);
  assert.equal(state.sessionUsedSec, 0);
  assert.equal(state.blockedUntilTs, null);
});

test('reaching session limit enters cooldown and resets session usage', () => {
  const now = at('2026-02-12T10:00:00.000Z');
  const initial = createInitialRuntimeState(now);

  const next = applyHeartbeat(initial, CONFIG, now, CONFIG.sessionLimitSec);

  assert.equal(next.mode, 'COOLDOWN');
  assert.equal(next.sessionUsedSec, 0);
  assert.equal(next.dailyUsedSec, CONFIG.sessionLimitSec);
  assert.equal(next.blockedUntilTs, now + CONFIG.cooldownSec * 1000);
  assert.equal(isBlocked(next, now + 30 * 1000), true);
});

test('reaching daily limit enters daily block until next local midnight', () => {
  const now = at('2026-02-12T20:00:00.000Z');
  const initial = createInitialRuntimeState(now);

  const next = applyHeartbeat(initial, CONFIG, now, CONFIG.dailyLimitSec);

  assert.equal(next.mode, 'DAILY_BLOCK');
  assert.equal(next.dailyUsedSec, CONFIG.dailyLimitSec);
  assert.equal(next.blockedUntilTs, getNextLocalMidnightTs(now));
});

test('day rollover resets runtime counters and mode', () => {
  const oldState = {
    dayKey: '2026-02-12',
    dailyUsedSec: 500,
    sessionUsedSec: 120,
    mode: 'DAILY_BLOCK',
    blockedUntilTs: at('2026-02-13T00:00:00.000Z'),
    lastHeartbeatTs: at('2026-02-12T21:00:00.000Z'),
  };

  const next = ensureCurrentDayState(oldState, at('2026-02-13T00:01:00.000Z'));

  assert.equal(next.dayKey, '2026-02-13');
  assert.equal(next.dailyUsedSec, 0);
  assert.equal(next.sessionUsedSec, 0);
  assert.equal(next.mode, 'ALLOWED');
  assert.equal(next.blockedUntilTs, null);
});

test('normalizeRuntimeState returns initial state for invalid storage object', async () => {
  const { normalizeRuntimeState } = await import('../src/core/state.mjs');
  const now = at('2026-02-12T10:00:00.000Z');

  const normalized = normalizeRuntimeState({ wrong: true }, now);

  assert.equal(normalized.mode, 'ALLOWED');
  assert.equal(normalized.dailyUsedSec, 0);
  assert.equal(normalized.dayKey, '2026-02-12');
});

test('applyHeartbeat unblocks expired cooldown before counting time', () => {
  const now = at('2026-02-12T10:10:00.000Z');
  const before = {
    dayKey: '2026-02-12',
    dailyUsedSec: 600,
    sessionUsedSec: 0,
    mode: 'COOLDOWN',
    blockedUntilTs: now - 1000,
    lastHeartbeatTs: now - 2000,
  };

  const next = applyHeartbeat(before, CONFIG, now, 5);

  assert.equal(next.mode, 'ALLOWED');
  assert.equal(next.dailyUsedSec, 605);
  assert.equal(next.sessionUsedSec, 5);
});
