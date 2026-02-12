const SITE_HOST_PATTERNS = {
  x: ['x.com', 'twitter.com'],
  instagram: ['instagram.com'],
};

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function getSiteKeyFromUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    for (const [siteKey, domains] of Object.entries(SITE_HOST_PATTERNS)) {
      for (const domain of domains) {
        if (hostMatches(hostname, domain)) {
          return siteKey;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function isTrackedSiteUrl(url) {
  return getSiteKeyFromUrl(url) !== null;
}
