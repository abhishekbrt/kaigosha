function $(id) {
  return document.getElementById(id);
}

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

async function sendMessage(payload) {
  return chrome.runtime.sendMessage(payload);
}

function renderSites(status) {
  const sitesRoot = $('sites');
  sitesRoot.textContent = '';

  const siteSelect = $('unlock-site');
  const existingValue = siteSelect.value;
  siteSelect.textContent = '';

  for (const site of status.sites) {
    const item = document.createElement('article');
    item.className = 'site-item';

    const title = document.createElement('strong');
    title.textContent = site.label;
    item.appendChild(title);

    const usageLine = document.createElement('p');
    usageLine.className = 'line';
    usageLine.textContent = `Session ${formatDuration(site.sessionRemainingSec)} left • Daily ${formatDuration(site.dailyRemainingSec)} left`;
    item.appendChild(usageLine);

    const stateLine = document.createElement('p');
    stateLine.className = 'line';

    if (site.blocked) {
      stateLine.classList.add('blocked');
      stateLine.textContent = `Blocked (${site.reason}) for ${formatDuration(site.remainingSec)}`;
    } else if (site.breakGlassActive) {
      stateLine.classList.add('warning');
      stateLine.textContent = `Break-glass active for ${formatDuration(site.breakGlassRemainingSec)}`;
    } else {
      stateLine.textContent = 'Allowed';
    }

    item.appendChild(stateLine);
    sitesRoot.appendChild(item);

    const option = document.createElement('option');
    option.value = site.id;
    option.textContent = site.label;
    siteSelect.appendChild(option);
  }

  if (existingValue) {
    siteSelect.value = existingValue;
  }

  if (!siteSelect.value && siteSelect.options.length > 0) {
    siteSelect.selectedIndex = 0;
  }
}

function setFeedback(message, isSuccess = false) {
  const feedback = $('feedback');
  feedback.textContent = message;
  feedback.className = isSuccess ? 'feedback success' : 'feedback';
}

async function refresh() {
  const response = await sendMessage({ type: 'GET_STATUS' });
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to load status');
  }

  const status = response.status;
  renderSites(status);
  $('overlay-toggle').checked = Boolean(status.settings.ui?.overlayEnabled);
}

async function toggleOverlay(enabled) {
  const response = await sendMessage({
    type: 'TOGGLE_OVERLAY',
    enabled,
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to update overlay setting');
  }
}

async function activateBreakGlass(event) {
  event.preventDefault();
  const siteId = $('unlock-site').value;
  const pin = $('unlock-pin').value;

  const response = await sendMessage({
    type: 'ACTIVATE_BREAK_GLASS',
    siteId,
    pin,
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to unlock site');
  }

  $('unlock-pin').value = '';
  setFeedback('Temporary unlock activated', true);
  await refresh();
}

$('overlay-toggle').addEventListener('change', (event) => {
  toggleOverlay(event.target.checked)
    .then(() => setFeedback('Overlay setting updated', true))
    .catch((error) => setFeedback(error.message));
});

$('unlock-form').addEventListener('submit', (event) => {
  activateBreakGlass(event).catch((error) => setFeedback(error.message));
});

$('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

$('open-diagnostics').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/diagnostics/diagnostics.html') });
});

refresh().catch((error) => setFeedback(error.message));
setInterval(() => {
  refresh().catch(() => {});
}, 1000);
