const HEARTBEAT_INTERVAL_MS = 1000;
const TIMER_BADGE_ID = 'kaigosha-timer-badge';

let formatTimerOverlayText = (siteStatus) => {
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

  const label = siteStatus?.label || siteStatus?.siteKey || 'Site';

  if (siteStatus?.blocked) {
    return `${label} blocked (${siteStatus.reason ?? 'blocked'}): ${formatDuration(siteStatus.remainingSec)} left`;
  }

  if (siteStatus?.breakGlassActive) {
    return `${label}: Break-glass active (${formatDuration(siteStatus.breakGlassRemainingSec)} left)`;
  }

  return `${label}: Session ${formatDuration(siteStatus?.sessionRemainingSec)} left • Daily ${formatDuration(siteStatus?.dailyRemainingSec)} left`;
};

function ensureTimerBadge() {
  let badge = document.getElementById(TIMER_BADGE_ID);
  if (badge) {
    return badge;
  }

  badge = document.createElement('div');
  badge.id = TIMER_BADGE_ID;
  badge.setAttribute('aria-live', 'polite');
  badge.style.position = 'fixed';
  badge.style.zIndex = '2147483647';
  badge.style.padding = '8px 10px';
  badge.style.borderRadius = '10px';
  badge.style.background = 'rgba(12, 18, 34, 0.92)';
  badge.style.color = '#ffffff';
  badge.style.fontFamily = 'Segoe UI, system-ui, sans-serif';
  badge.style.fontSize = '12px';
  badge.style.lineHeight = '1.3';
  badge.style.boxShadow = '0 8px 18px rgba(0,0,0,0.28)';
  badge.style.maxWidth = '320px';
  badge.style.pointerEvents = 'none';
  badge.style.backdropFilter = 'blur(4px)';
  badge.style.display = 'none';

  document.documentElement.appendChild(badge);
  return badge;
}

function applyBadgePosition(badge, position) {
  badge.style.top = '';
  badge.style.right = '';
  badge.style.bottom = '';
  badge.style.left = '';

  switch (position) {
    case 'top-left':
      badge.style.top = '12px';
      badge.style.left = '12px';
      break;
    case 'bottom-left':
      badge.style.bottom = '12px';
      badge.style.left = '12px';
      break;
    case 'bottom-right':
      badge.style.bottom = '12px';
      badge.style.right = '12px';
      break;
    case 'top-right':
    default:
      badge.style.top = '12px';
      badge.style.right = '12px';
      break;
  }
}

function hideBadge() {
  const badge = ensureTimerBadge();
  badge.style.display = 'none';
}

function renderStatus(siteStatus, ui) {
  const badge = ensureTimerBadge();

  if (!siteStatus || ui?.overlayEnabled === false) {
    badge.style.display = 'none';
    return;
  }

  applyBadgePosition(badge, ui?.position || 'top-right');
  badge.style.display = 'block';
  badge.textContent = formatTimerOverlayText(siteStatus);

  if (siteStatus.blocked) {
    badge.style.background = 'rgba(133, 19, 45, 0.92)';
  } else if (siteStatus.breakGlassActive) {
    badge.style.background = 'rgba(19, 98, 70, 0.92)';
  } else {
    badge.style.background = 'rgba(12, 18, 34, 0.92)';
  }
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

function handleStatusResponse(response) {
  if (!response?.ok) {
    return;
  }

  renderStatus(response.site, response.ui);
}

function requestSiteStatus() {
  chrome.runtime.sendMessage(
    {
      type: 'GET_SITE_STATUS',
      url: window.location.href,
    },
    (response) => {
      void chrome.runtime.lastError;
      handleStatusResponse(response);
    }
  );
}

function sendHeartbeat() {
  chrome.runtime.sendMessage(
    {
      type: 'HEARTBEAT',
      url: window.location.href,
      sentAtTs: Date.now(),
    },
    (response) => {
      void chrome.runtime.lastError;
      handleStatusResponse(response);
    }
  );
}

function tick() {
  if (document.visibilityState !== 'visible') {
    return;
  }

  if (document.hasFocus()) {
    sendHeartbeat();
    return;
  }

  requestSiteStatus();
}

loadFormatterModule();
setInterval(tick, HEARTBEAT_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    hideBadge();
    return;
  }
  tick();
});

window.addEventListener('focus', tick);
window.addEventListener('pageshow', tick);
window.addEventListener('blur', requestSiteStatus);

requestSiteStatus();
