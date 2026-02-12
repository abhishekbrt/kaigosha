const SITE_LABELS = {
  x: 'X / Twitter',
  instagram: 'Instagram',
};

function formatDuration(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
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

function parseQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    siteKey: params.get('site') ?? 'x',
    reason: params.get('reason') ?? 'cooldown',
  };
}

function renderTitle(siteKey) {
  const label = SITE_LABELS[siteKey] ?? siteKey;
  document.getElementById('title').textContent = `${label} is blocked`;
}

function renderReason(reason) {
  const reasonText = reason === 'daily' ? 'Daily limit reached' : 'Session limit reached';
  document.getElementById('reason').textContent = reasonText;
}

function renderCountdown(remainingSec, blockedUntilTs) {
  if (remainingSec <= 0) {
    document.getElementById('countdown').textContent = 'You can retry now.';
    return;
  }

  const until = new Date(blockedUntilTs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  document.getElementById('countdown').textContent = `Retry in ${formatDuration(remainingSec)} (unlocks around ${until})`;
}

async function refresh(siteKey, fallbackReason) {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_SITE_STATUS',
    siteKey,
  });

  if (!response?.ok || !response.site) {
    document.getElementById('countdown').textContent = 'Status unavailable. Check extension popup.';
    return;
  }

  renderReason(response.site.reason ?? fallbackReason);
  renderCountdown(response.site.remainingSec, response.site.blockedUntilTs);
}

const { siteKey, reason } = parseQuery();
renderTitle(siteKey);
renderReason(reason);

refresh(siteKey, reason).catch(() => {
  document.getElementById('countdown').textContent = 'Status unavailable. Check extension popup.';
});

setInterval(() => {
  refresh(siteKey, reason).catch(() => {});
}, 1000);
