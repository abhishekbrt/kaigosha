export const SETTINGS_VERSION = 2;

export const DEFAULT_SITE_CONFIG = {
  dailyLimitSec: 30 * 60,
  sessionLimitSec: 10 * 60,
  cooldownSec: 2 * 60,
};

export const DEFAULT_SITE_PRESETS = [
  {
    id: 'x',
    label: 'X / Twitter',
    domains: ['x.com', 'twitter.com'],
    enabled: true,
    ...DEFAULT_SITE_CONFIG,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    domains: ['instagram.com'],
    enabled: true,
    ...DEFAULT_SITE_CONFIG,
  },
];

export const DEFAULT_WARNING = {
  enabled: true,
  thresholdSec: 60,
  notify: true,
};

export const DEFAULT_BREAK_GLASS = {
  enabled: true,
  pinHash: null,
  pinSalt: null,
  pinIterations: 210000,
  durationSec: 5 * 60,
  maxUsesPerDay: 2,
};

export const DEFAULT_UI = {
  overlayEnabled: true,
  position: 'top-right',
};

export const DEFAULT_V2_SETTINGS = {
  version: SETTINGS_VERSION,
  sites: DEFAULT_SITE_PRESETS.map((site) => ({ ...site, domains: [...site.domains] })),
  warning: { ...DEFAULT_WARNING },
  breakGlass: { ...DEFAULT_BREAK_GLASS },
  ui: { ...DEFAULT_UI },
};

export const SITE_KEYS = DEFAULT_SITE_PRESETS.map((site) => site.id);

// Backward-compat map for legacy callers/tests.
export const DEFAULT_SETTINGS = Object.fromEntries(
  DEFAULT_SITE_PRESETS.map((site) => [
    site.id,
    {
      dailyLimitSec: site.dailyLimitSec,
      sessionLimitSec: site.sessionLimitSec,
      cooldownSec: site.cooldownSec,
    },
  ])
);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isValidPosition(value) {
  return value === 'top-right' || value === 'top-left' || value === 'bottom-right' || value === 'bottom-left';
}

function normalizeDomainCandidate(input) {
  if (typeof input !== 'string') {
    return null;
  }

  let value = input.trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (value.includes('://')) {
    try {
      value = new URL(value).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  if (value.startsWith('*.')) {
    value = value.slice(2);
  }

  if (value.startsWith('.')) {
    value = value.slice(1);
  }

  if (value.includes('/')) {
    value = value.split('/')[0];
  }

  if (!/^[a-z0-9.-]+$/.test(value)) {
    return null;
  }

  if (!value.includes('.') || value.endsWith('.')) {
    return null;
  }

  return value;
}

function normalizeDomains(domains) {
  if (!Array.isArray(domains)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const domain of domains) {
    const valid = normalizeDomainCandidate(domain);
    if (!valid || seen.has(valid)) {
      continue;
    }
    seen.add(valid);
    normalized.push(valid);
  }

  return normalized;
}

function sanitizeSiteId(value, fallbackIndex) {
  if (typeof value !== 'string') {
    return `site-${fallbackIndex}`;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || `site-${fallbackIndex}`;
}

function normalizeSiteDefinition(rawSite, fallbackSite, fallbackIndex) {
  const safeFallback = fallbackSite
    ? {
        ...fallbackSite,
        domains: [...fallbackSite.domains],
      }
    : null;

  if (!rawSite || typeof rawSite !== 'object') {
    return safeFallback;
  }

  const site = {
    id: sanitizeSiteId(rawSite.id ?? safeFallback?.id, fallbackIndex),
    label: typeof rawSite.label === 'string' && rawSite.label.trim() ? rawSite.label.trim() : safeFallback?.label ?? `Site ${fallbackIndex}`,
    domains: normalizeDomains(rawSite.domains),
    dailyLimitSec: rawSite.dailyLimitSec,
    sessionLimitSec: rawSite.sessionLimitSec,
    cooldownSec: rawSite.cooldownSec,
    enabled: typeof rawSite.enabled === 'boolean' ? rawSite.enabled : safeFallback?.enabled ?? true,
  };

  if (site.domains.length === 0) {
    return safeFallback;
  }

  if (!isPositiveInteger(site.dailyLimitSec) || !isPositiveInteger(site.sessionLimitSec) || !isPositiveInteger(site.cooldownSec)) {
    return safeFallback;
  }

  if (site.sessionLimitSec > site.dailyLimitSec) {
    return safeFallback;
  }

  return site;
}

function normalizeWarning(rawWarning) {
  if (!rawWarning || typeof rawWarning !== 'object') {
    return { ...DEFAULT_WARNING };
  }

  const thresholdSec = isPositiveInteger(rawWarning.thresholdSec) ? rawWarning.thresholdSec : DEFAULT_WARNING.thresholdSec;
  return {
    enabled: typeof rawWarning.enabled === 'boolean' ? rawWarning.enabled : DEFAULT_WARNING.enabled,
    thresholdSec,
    notify: typeof rawWarning.notify === 'boolean' ? rawWarning.notify : DEFAULT_WARNING.notify,
  };
}

function normalizeBreakGlass(rawBreakGlass) {
  if (!rawBreakGlass || typeof rawBreakGlass !== 'object') {
    return { ...DEFAULT_BREAK_GLASS };
  }

  return {
    enabled: typeof rawBreakGlass.enabled === 'boolean' ? rawBreakGlass.enabled : DEFAULT_BREAK_GLASS.enabled,
    pinHash: typeof rawBreakGlass.pinHash === 'string' && rawBreakGlass.pinHash ? rawBreakGlass.pinHash : null,
    pinSalt: typeof rawBreakGlass.pinSalt === 'string' && rawBreakGlass.pinSalt ? rawBreakGlass.pinSalt : null,
    pinIterations:
      isPositiveInteger(rawBreakGlass.pinIterations) && rawBreakGlass.pinIterations >= 100000
        ? rawBreakGlass.pinIterations
        : DEFAULT_BREAK_GLASS.pinIterations,
    durationSec: isPositiveInteger(rawBreakGlass.durationSec) ? rawBreakGlass.durationSec : DEFAULT_BREAK_GLASS.durationSec,
    maxUsesPerDay: isPositiveInteger(rawBreakGlass.maxUsesPerDay) ? rawBreakGlass.maxUsesPerDay : DEFAULT_BREAK_GLASS.maxUsesPerDay,
  };
}

function normalizeUi(rawUi) {
  if (!rawUi || typeof rawUi !== 'object') {
    return { ...DEFAULT_UI };
  }

  return {
    overlayEnabled: typeof rawUi.overlayEnabled === 'boolean' ? rawUi.overlayEnabled : DEFAULT_UI.overlayEnabled,
    position: isValidPosition(rawUi.position) ? rawUi.position : DEFAULT_UI.position,
  };
}

function normalizeV2Settings(rawSettings) {
  const normalizedSites = [];
  const seenIds = new Set();

  if (Array.isArray(rawSettings.sites)) {
    for (let index = 0; index < rawSettings.sites.length; index += 1) {
      const normalizedSite = normalizeSiteDefinition(rawSettings.sites[index], null, index + 1);
      if (!normalizedSite || seenIds.has(normalizedSite.id)) {
        continue;
      }
      seenIds.add(normalizedSite.id);
      normalizedSites.push(normalizedSite);
    }
  }

  if (normalizedSites.length === 0) {
    return deepClone(DEFAULT_V2_SETTINGS);
  }

  return {
    version: SETTINGS_VERSION,
    sites: normalizedSites,
    warning: normalizeWarning(rawSettings.warning),
    breakGlass: normalizeBreakGlass(rawSettings.breakGlass),
    ui: normalizeUi(rawSettings.ui),
  };
}

function looksLikeLegacySettings(rawSettings) {
  return Boolean(rawSettings?.x || rawSettings?.instagram);
}

function normalizeLegacySiteConfig(rawConfig, fallbackSite) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return {
      ...fallbackSite,
      domains: [...fallbackSite.domains],
    };
  }

  const dailyLimitSec = isPositiveInteger(rawConfig.dailyLimitSec) ? rawConfig.dailyLimitSec : fallbackSite.dailyLimitSec;
  const sessionLimitSec = isPositiveInteger(rawConfig.sessionLimitSec) ? rawConfig.sessionLimitSec : fallbackSite.sessionLimitSec;
  const cooldownSec = isPositiveInteger(rawConfig.cooldownSec) ? rawConfig.cooldownSec : fallbackSite.cooldownSec;

  if (sessionLimitSec > dailyLimitSec) {
    return {
      ...fallbackSite,
      domains: [...fallbackSite.domains],
    };
  }

  return {
    ...fallbackSite,
    domains: [...fallbackSite.domains],
    dailyLimitSec,
    sessionLimitSec,
    cooldownSec,
    enabled: true,
  };
}

function migrateLegacySettings(rawSettings) {
  const sites = DEFAULT_SITE_PRESETS.map((preset) => normalizeLegacySiteConfig(rawSettings?.[preset.id], preset));

  return {
    version: SETTINGS_VERSION,
    sites,
    warning: { ...DEFAULT_WARNING },
    breakGlass: { ...DEFAULT_BREAK_GLASS },
    ui: { ...DEFAULT_UI },
  };
}

export function normalizeSettings(rawSettings) {
  if (!rawSettings || typeof rawSettings !== 'object') {
    return deepClone(DEFAULT_V2_SETTINGS);
  }

  if (rawSettings.version === SETTINGS_VERSION) {
    return normalizeV2Settings(rawSettings);
  }

  if (looksLikeLegacySettings(rawSettings)) {
    return migrateLegacySettings(rawSettings);
  }

  return deepClone(DEFAULT_V2_SETTINGS);
}

export function buildLegacySettingsMap(v2Settings) {
  const settings = normalizeSettings(v2Settings);
  const map = {};

  for (const site of settings.sites) {
    map[site.id] = {
      dailyLimitSec: site.dailyLimitSec,
      sessionLimitSec: site.sessionLimitSec,
      cooldownSec: site.cooldownSec,
    };
  }

  return map;
}

export function secondsFromMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed * 60);
}

export function minutesFromSeconds(value) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.max(1, Math.round(value / 60));
}
