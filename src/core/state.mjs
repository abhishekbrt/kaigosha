const MODE = {
  ALLOWED: 'ALLOWED',
  COOLDOWN: 'COOLDOWN',
  DAILY_BLOCK: 'DAILY_BLOCK',
};

function toDayKey(timestampMs) {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNextLocalMidnightTs(timestampMs) {
  const date = new Date(timestampMs);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

export function createInitialRuntimeState(nowTs) {
  return {
    dayKey: toDayKey(nowTs),
    dailyUsedSec: 0,
    sessionUsedSec: 0,
    mode: MODE.ALLOWED,
    blockedUntilTs: null,
    lastHeartbeatTs: null,
  };
}

function isValidMode(value) {
  return value === MODE.ALLOWED || value === MODE.COOLDOWN || value === MODE.DAILY_BLOCK;
}

export function normalizeRuntimeState(rawState, nowTs) {
  if (!rawState || typeof rawState !== 'object') {
    return createInitialRuntimeState(nowTs);
  }

  const baseState = createInitialRuntimeState(nowTs);

  const normalized = {
    dayKey: typeof rawState.dayKey === 'string' ? rawState.dayKey : baseState.dayKey,
    dailyUsedSec:
      Number.isInteger(rawState.dailyUsedSec) && rawState.dailyUsedSec >= 0
        ? rawState.dailyUsedSec
        : 0,
    sessionUsedSec:
      Number.isInteger(rawState.sessionUsedSec) && rawState.sessionUsedSec >= 0
        ? rawState.sessionUsedSec
        : 0,
    mode: isValidMode(rawState.mode) ? rawState.mode : MODE.ALLOWED,
    blockedUntilTs: Number.isFinite(rawState.blockedUntilTs) ? rawState.blockedUntilTs : null,
    lastHeartbeatTs: Number.isFinite(rawState.lastHeartbeatTs) ? rawState.lastHeartbeatTs : null,
  };

  return ensureCurrentDayState(normalized, nowTs);
}

export function ensureCurrentDayState(state, nowTs) {
  const dayKey = toDayKey(nowTs);
  if (state.dayKey === dayKey) {
    return { ...state };
  }

  return {
    dayKey,
    dailyUsedSec: 0,
    sessionUsedSec: 0,
    mode: MODE.ALLOWED,
    blockedUntilTs: null,
    lastHeartbeatTs: null,
  };
}

function unblockIfElapsed(state, nowTs) {
  if (
    (state.mode === MODE.COOLDOWN || state.mode === MODE.DAILY_BLOCK) &&
    typeof state.blockedUntilTs === 'number' &&
    nowTs >= state.blockedUntilTs
  ) {
    return {
      ...state,
      mode: MODE.ALLOWED,
      blockedUntilTs: null,
    };
  }

  return state;
}

export function isBlocked(state, nowTs) {
  if (state.mode === MODE.ALLOWED) {
    return false;
  }

  if (typeof state.blockedUntilTs !== 'number') {
    return false;
  }

  return nowTs < state.blockedUntilTs;
}

export function applyHeartbeat(state, config, nowTs, deltaSec) {
  const normalizedDeltaSec = Math.max(0, Math.floor(deltaSec));

  let next = ensureCurrentDayState(state, nowTs);
  next = unblockIfElapsed(next, nowTs);

  if (isBlocked(next, nowTs)) {
    return {
      ...next,
      lastHeartbeatTs: nowTs,
    };
  }

  const dailyUsedSec = next.dailyUsedSec + normalizedDeltaSec;
  const sessionUsedSec = next.sessionUsedSec + normalizedDeltaSec;

  if (dailyUsedSec >= config.dailyLimitSec) {
    return {
      ...next,
      dailyUsedSec: config.dailyLimitSec,
      sessionUsedSec,
      mode: MODE.DAILY_BLOCK,
      blockedUntilTs: getNextLocalMidnightTs(nowTs),
      lastHeartbeatTs: nowTs,
    };
  }

  if (sessionUsedSec >= config.sessionLimitSec) {
    return {
      ...next,
      dailyUsedSec,
      sessionUsedSec: 0,
      mode: MODE.COOLDOWN,
      blockedUntilTs: nowTs + config.cooldownSec * 1000,
      lastHeartbeatTs: nowTs,
    };
  }

  return {
    ...next,
    dailyUsedSec,
    sessionUsedSec,
    mode: MODE.ALLOWED,
    blockedUntilTs: null,
    lastHeartbeatTs: nowTs,
  };
}
