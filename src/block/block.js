import { sanitizeReturnUrl } from '../core/security.mjs';

function formatDuration(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec || 0));
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function setFeedback(message, success = false) {
  const feedback = document.getElementById('feedback');
  feedback.textContent = message;
  feedback.className = success ? 'feedback success' : 'feedback';
}

function parseQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    siteId: params.get('siteId') || '',
    reason: params.get('reason') || 'cooldown',
    returnUrl: params.get('returnUrl') || '',
  };
}

function renderReason(siteStatus, fallbackReason) {
  const reason = siteStatus?.reason || fallbackReason;
  const reasonText = reason === 'daily' ? 'Daily limit reached' : 'Session limit reached';
  document.getElementById('reason').textContent = reasonText;
}

function renderTitle(siteStatus, siteId) {
  const label = siteStatus?.label || siteId || 'Site';
  document.getElementById('title').textContent = `${label} is blocked`;
}

function renderCountdown(siteStatus) {
  const countdown = document.getElementById('countdown');

  if (!siteStatus) {
    countdown.textContent = 'Status unavailable';
    return;
  }

  if (!siteStatus.blocked) {
    if (siteStatus.breakGlassActive) {
      countdown.textContent = `Break-glass active for ${formatDuration(siteStatus.breakGlassRemainingSec)}`;
    } else {
      countdown.textContent = 'You can retry now.';
    }
    return;
  }

  countdown.textContent = `Retry in ${formatDuration(siteStatus.remainingSec)}`;
}

async function getSiteStatus(siteId) {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_SITE_STATUS',
    siteId,
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Failed to load status');
  }

  return response.site;
}

async function activateBreakGlass(siteId, pin) {
  const response = await chrome.runtime.sendMessage({
    type: 'ACTIVATE_BREAK_GLASS',
    siteId,
    pin,
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Unlock failed');
  }

  return response;
}

function navigateToReturnUrl(returnUrl, siteStatus) {
  const allowedDomains = Array.isArray(siteStatus?.domains) ? siteStatus.domains : [];
  const safeReturnUrl = sanitizeReturnUrl(returnUrl, allowedDomains);

  if (safeReturnUrl) {
    window.location.href = safeReturnUrl;
    return;
  }

  if (allowedDomains.length > 0) {
    const fallbackUrl = sanitizeReturnUrl(`https://${allowedDomains[0]}`, allowedDomains);
    if (fallbackUrl) {
      window.location.href = fallbackUrl;
    }
  }
}

const context = parseQuery();

async function refresh() {
  const siteStatus = await getSiteStatus(context.siteId);
  renderTitle(siteStatus, context.siteId);
  renderReason(siteStatus, context.reason);
  renderCountdown(siteStatus);

  if (!siteStatus?.blocked && !siteStatus?.breakGlassActive) {
    setFeedback('Site available now', true);
  }

  return siteStatus;
}

document.getElementById('unlock-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const pin = document.getElementById('pin').value;

  activateBreakGlass(context.siteId, pin)
    .then(() => {
      setFeedback('Temporary unlock activated', true);
      document.getElementById('pin').value = '';
      return refresh();
    })
    .then((siteStatus) => {
      navigateToReturnUrl(context.returnUrl, siteStatus);
    })
    .catch((error) => setFeedback(error.message));
});

document.getElementById('retry').addEventListener('click', () => {
  refresh()
    .then((siteStatus) => {
      if (!siteStatus?.blocked || siteStatus?.breakGlassActive) {
        navigateToReturnUrl(context.returnUrl, siteStatus);
      }
    })
    .catch((error) => setFeedback(error.message));
});

refresh().catch((error) => setFeedback(error.message));
setInterval(() => {
  refresh().catch(() => {});
}, 1000);
