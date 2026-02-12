function toDayKey(timestampMs) {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createInitialBreakGlassRuntime(nowTs) {
  return {
    active: null,
    usage: {
      dayKey: toDayKey(nowTs),
      count: 0,
    },
  };
}

export function normalizeBreakGlassRuntime(rawRuntime, nowTs) {
  const initial = createInitialBreakGlassRuntime(nowTs);

  if (!rawRuntime || typeof rawRuntime !== 'object') {
    return initial;
  }

  const dayKey = toDayKey(nowTs);
  const usage = rawRuntime.usage && typeof rawRuntime.usage === 'object'
    ? {
        dayKey: typeof rawRuntime.usage.dayKey === 'string' ? rawRuntime.usage.dayKey : dayKey,
        count: Number.isInteger(rawRuntime.usage.count) && rawRuntime.usage.count >= 0 ? rawRuntime.usage.count : 0,
      }
    : { dayKey, count: 0 };

  const active = rawRuntime.active && typeof rawRuntime.active === 'object'
    ? {
        siteId: typeof rawRuntime.active.siteId === 'string' ? rawRuntime.active.siteId : null,
        untilTs: Number.isFinite(rawRuntime.active.untilTs) ? rawRuntime.active.untilTs : 0,
      }
    : null;

  const normalized = {
    usage,
    active: active?.siteId && active.untilTs > nowTs ? active : null,
  };

  if (normalized.usage.dayKey !== dayKey) {
    normalized.usage = { dayKey, count: 0 };
  }

  return normalized;
}

export function isBreakGlassActive(runtime, siteId, nowTs) {
  const normalized = normalizeBreakGlassRuntime(runtime, nowTs);
  return Boolean(normalized.active && normalized.active.siteId === siteId && nowTs < normalized.active.untilTs);
}

export function canActivateBreakGlass(runtime, breakGlassConfig, nowTs) {
  if (!breakGlassConfig?.enabled) {
    return false;
  }

  const normalized = normalizeBreakGlassRuntime(runtime, nowTs);
  return normalized.usage.count < breakGlassConfig.maxUsesPerDay;
}

export function activateBreakGlass(runtime, breakGlassConfig, siteId, nowTs) {
  const normalized = normalizeBreakGlassRuntime(runtime, nowTs);

  if (!canActivateBreakGlass(normalized, breakGlassConfig, nowTs)) {
    return normalized;
  }

  return {
    usage: {
      dayKey: normalized.usage.dayKey,
      count: normalized.usage.count + 1,
    },
    active: {
      siteId,
      untilTs: nowTs + breakGlassConfig.durationSec * 1000,
    },
  };
}
