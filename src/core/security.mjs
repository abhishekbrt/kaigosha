function normalizeHostname(hostname) {
  if (typeof hostname !== 'string') {
    return null;
  }

  const value = hostname.trim().toLowerCase();
  if (!value) {
    return null;
  }

  return value.startsWith('*.') ? value.slice(2) : value;
}

function hostMatchesDomain(hostname, domain) {
  const normalizedHost = normalizeHostname(hostname);
  const normalizedDomain = normalizeHostname(domain);
  if (!normalizedHost || !normalizedDomain) {
    return false;
  }

  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

export function sanitizeReturnUrl(returnUrl, allowedDomains = []) {
  if (typeof returnUrl !== 'string' || !returnUrl.trim()) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(returnUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  if (Array.isArray(allowedDomains) && allowedDomains.length > 0) {
    const isAllowed = allowedDomains.some((domain) => hostMatchesDomain(parsed.hostname, domain));
    if (!isAllowed) {
      return null;
    }
  }

  return parsed.toString();
}
