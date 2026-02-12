export const SITE_KEYS = ['x', 'instagram'];

export const DEFAULT_SITE_CONFIG = {
  dailyLimitSec: 30 * 60,
  sessionLimitSec: 10 * 60,
  cooldownSec: 2 * 60,
};

export const DEFAULT_SETTINGS = {
  x: { ...DEFAULT_SITE_CONFIG },
  instagram: { ...DEFAULT_SITE_CONFIG },
};

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isValidSiteConfig(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }

  if (!isPositiveInteger(config.dailyLimitSec)) {
    return false;
  }

  if (!isPositiveInteger(config.sessionLimitSec)) {
    return false;
  }

  if (!isPositiveInteger(config.cooldownSec)) {
    return false;
  }

  return config.sessionLimitSec <= config.dailyLimitSec;
}

export function normalizeSettings(rawSettings) {
  const settings = {};

  for (const siteKey of SITE_KEYS) {
    const siteConfig = rawSettings?.[siteKey];
    settings[siteKey] = isValidSiteConfig(siteConfig)
      ? {
          dailyLimitSec: siteConfig.dailyLimitSec,
          sessionLimitSec: siteConfig.sessionLimitSec,
          cooldownSec: siteConfig.cooldownSec,
        }
      : { ...DEFAULT_SETTINGS[siteKey] };
  }

  return settings;
}

export function secondsFromMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed * 60);
}
