const HEARTBEAT_INTERVAL_MS = 1000;
const TIMER_BADGE_ID = 'kaigosha-timer-badge';

const SITE_HOST_PATTERNS = {
  x: ['x.com', 'twitter.com'],
  instagram: ['instagram.com'],
};

let formatTimerOverlayText = (siteStatus) => {
  const siteLabel = siteStatus?.siteKey === 'instagram' ? 'Instagram' : 'X';
  const formatDuration = (totalSec) => {
    const sec = Math.max(0, Math.floor(totalSec ?? 0));
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;

    if (minutes > 0 && seconds > 0) {
      return `${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  };

  if (siteStatus?.blocked) {
    return `${siteLabel} blocked (${siteStatus.reason ?? 'blocked'}): ${formatDuration(siteStatus?.remainingSec)} left`;
  }

  return `${siteLabel}: Session ${formatDuration(siteStatus?.sessionRemainingSec)} left • Daily ${formatDuration(siteStatus?.dailyRemainingSec)} left`;
};

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function getCurrentSiteKey() {
  const hostname = window.location.hostname.toLowerCase();

  for (const [siteKey, domains] of Object.entries(SITE_HOST_PATTERNS)) {
    for (const domain of domains) {
      if (hostMatches(hostname, domain)) {
        return siteKey;
      }
    }
  }

  return null;
}

function ensureTimerBadge() {
  let badge = document.getElementById(TIMER_BADGE_ID);
  if (badge) {
    return badge;
  }

  badge = document.createElement('div');
  badge.id = TIMER_BADGE_ID;
  badge.setAttribute('aria-live', 'polite');
  badge.style.position = 'fixed';
  badge.style.top = '12px';
  badge.style.right = '12px';
  badge.style.zIndex = '2147483647';
  badge.style.padding = '8px 10px';
  badge.style.borderRadius = '10px';
  badge.style.background = 'rgba(12, 18, 34, 0.92)';
  badge.style.color = '#ffffff';
  badge.style.fontFamily = 'Segoe UI, system-ui, sans-serif';
  badge.style.fontSize = '12px';
  badge.style.lineHeight = '1.3';
  badge.style.boxShadow = '0 8px 18px rgba(0,0,0,0.28)';
  badge.style.maxWidth = '280px';
  badge.style.pointerEvents = 'none';
  badge.style.backdropFilter = 'blur(4px)';
  badge.textContent = 'Kaigosha timer loading...';

  document.documentElement.appendChild(badge);
  return badge;
}

function renderStatus(siteStatus) {
  const badge = ensureTimerBadge();

  badge.textContent = formatTimerOverlayText(siteStatus);
  badge.style.background = siteStatus?.blocked ? 'rgba(133, 19, 45, 0.92)' : 'rgba(12, 18, 34, 0.92)';
}

function loadFormatterModule() {
  import(chrome.runtime.getURL('src/core/timer-display.mjs'))
    .then((module) => {
      if (typeof module.formatTimerOverlayText === 'function') {
        formatTimerOverlayText = module.formatTimerOverlayText;
      }
    })
    .catch(() => {
      // Keep fallback formatter.
    });
}

function shouldSendHeartbeat() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function sendHeartbeat() {
  if (!shouldSendHeartbeat()) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: 'HEARTBEAT',
      url: window.location.href,
      sentAtTs: Date.now(),
    },
    () => {
      // Ignore runtime errors when extension context is unavailable.
      void chrome.runtime.lastError;
    }
  );
}

function fetchAndRenderStatus() {
  const siteKey = getCurrentSiteKey();
  if (!siteKey) {
    return;
  }

  chrome.runtime.sendMessage({ type: 'GET_SITE_STATUS', siteKey }, (response) => {
    if (!response?.ok || !response.site) {
      return;
    }
    renderStatus(response.site);
  });
}

function tick() {
  if (shouldSendHeartbeat()) {
    sendHeartbeat();
  }

  if (document.visibilityState === 'visible') {
    fetchAndRenderStatus();
  }
}

loadFormatterModule();
setInterval(tick, HEARTBEAT_INTERVAL_MS);

document.addEventListener('visibilitychange', sendHeartbeat);
window.addEventListener('focus', sendHeartbeat);
window.addEventListener('pageshow', sendHeartbeat);

document.addEventListener('visibilitychange', fetchAndRenderStatus);
window.addEventListener('focus', fetchAndRenderStatus);
window.addEventListener('pageshow', fetchAndRenderStatus);

tick();
