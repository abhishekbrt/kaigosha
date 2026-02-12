import { DEFAULT_V2_SETTINGS } from './config.mjs';

function normalizeHostname(hostname) {
  if (typeof hostname !== 'string') {
    return null;
  }

  let value = hostname.trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (value.startsWith('*.')) {
    value = value.slice(2);
  }

  if (value.startsWith('.')) {
    value = value.slice(1);
  }

  return value || null;
}

export function hostMatchesDomain(hostname, domain) {
  const normalizedHost = normalizeHostname(hostname);
  const normalizedDomain = normalizeHostname(domain);
  if (!normalizedHost || !normalizedDomain) {
    return false;
  }

  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function getHostnameFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function compileSiteMatchers(sites) {
  if (!Array.isArray(sites)) {
    return [];
  }

  const matchers = [];

  for (const site of sites) {
    if (!site || typeof site !== 'object') {
      continue;
    }

    if (site.enabled === false) {
      continue;
    }

    if (typeof site.id !== 'string' || !site.id) {
      continue;
    }

    if (!Array.isArray(site.domains) || site.domains.length === 0) {
      continue;
    }

    const domains = [];
    const seen = new Set();

    for (const domain of site.domains) {
      const normalized = normalizeHostname(domain);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      domains.push(normalized);
    }

    if (domains.length === 0) {
      continue;
    }

    matchers.push({
      id: site.id,
      label: typeof site.label === 'string' && site.label ? site.label : site.id,
      domains,
    });
  }

  return matchers;
}

export function getMatchedSiteFromUrl(url, matchers) {
  const hostname = getHostnameFromUrl(url);
  if (!hostname) {
    return null;
  }

  for (const matcher of matchers) {
    for (const domain of matcher.domains) {
      if (hostMatchesDomain(hostname, domain)) {
        return matcher;
      }
    }
  }

  return null;
}

const defaultMatchers = compileSiteMatchers(DEFAULT_V2_SETTINGS.sites);

export function getSiteKeyFromUrl(url) {
  return getMatchedSiteFromUrl(url, defaultMatchers)?.id ?? null;
}

export function isTrackedSiteUrl(url, matchers = defaultMatchers) {
  return getMatchedSiteFromUrl(url, matchers) !== null;
}
