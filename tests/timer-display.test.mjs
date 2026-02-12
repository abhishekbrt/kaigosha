import test from 'node:test';
import assert from 'node:assert/strict';

import { formatTimerOverlayText } from '../src/core/timer-display.mjs';

test('formats active usage timer text with session and daily remaining', () => {
  const text = formatTimerOverlayText({
    siteKey: 'x',
    blocked: false,
    sessionRemainingSec: 95,
    dailyRemainingSec: 1200,
  });

  assert.equal(text, 'X: Session 1m 35s left • Daily 20m left');
});

test('formats blocked timer text with reason and remaining time', () => {
  const text = formatTimerOverlayText({
    siteKey: 'instagram',
    blocked: true,
    reason: 'cooldown',
    remainingSec: 42,
  });

  assert.equal(text, 'Instagram blocked (cooldown): 42s left');
});

test('falls back safely for unknown site values', () => {
  const text = formatTimerOverlayText({
    siteKey: 'unknown',
    blocked: false,
    sessionRemainingSec: 5,
    dailyRemainingSec: 10,
  });

  assert.equal(text, 'Site: Session 5s left • Daily 10s left');
});
