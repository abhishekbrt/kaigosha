import { SITE_KEYS, secondsFromMinutes } from '../core/config.mjs';

const SITE_LABELS = {
  x: 'X/Twitter',
  instagram: 'Instagram',
};

function $(id) {
  return document.getElementById(id);
}

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

function setFormValuesFromSettings(settings) {
  for (const siteKey of SITE_KEYS) {
    const siteSettings = settings[siteKey];
    $(`${siteKey}-daily`).value = String(Math.round(siteSettings.dailyLimitSec / 60));
    $(`${siteKey}-session`).value = String(Math.round(siteSettings.sessionLimitSec / 60));
    $(`${siteKey}-cooldown`).value = String(Math.round(siteSettings.cooldownSec / 60));
  }
}

function renderSiteStatuses(statuses) {
  for (const siteKey of SITE_KEYS) {
    const siteStatus = statuses[siteKey];
    const line = $(`${siteKey}-status`);
    if (!siteStatus) {
      line.textContent = 'Status unavailable';
      line.className = 'status';
      continue;
    }

    if (siteStatus.blocked) {
      line.textContent = `Blocked (${siteStatus.reason}) for ${formatDuration(siteStatus.remainingSec)}`;
      line.className = 'status blocked';
      continue;
    }

    line.textContent = `Used today ${formatDuration(siteStatus.dailyUsedSec)} / ${formatDuration(siteStatus.config.dailyLimitSec)}`;
    line.className = 'status allowed';
  }
}

function readSettingsFromForm() {
  const settings = {};

  for (const siteKey of SITE_KEYS) {
    const dailyLimitSec = secondsFromMinutes($(`${siteKey}-daily`).value);
    const sessionLimitSec = secondsFromMinutes($(`${siteKey}-session`).value);
    const cooldownSec = secondsFromMinutes($(`${siteKey}-cooldown`).value);

    if (!dailyLimitSec || !sessionLimitSec || !cooldownSec) {
      throw new Error(`All values for ${SITE_LABELS[siteKey]} must be positive whole numbers.`);
    }

    if (sessionLimitSec > dailyLimitSec) {
      throw new Error(`${SITE_LABELS[siteKey]} session limit cannot exceed daily limit.`);
    }

    settings[siteKey] = {
      dailyLimitSec,
      sessionLimitSec,
      cooldownSec,
    };
  }

  return settings;
}

async function sendMessage(payload) {
  return chrome.runtime.sendMessage(payload);
}

async function loadStatusAndSettings() {
  const response = await sendMessage({ type: 'GET_STATUS' });
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to load status.');
  }

  setFormValuesFromSettings(response.status.settings);
  renderSiteStatuses(response.status.sites);
}

async function handleSave(event) {
  event.preventDefault();
  const feedback = $('feedback');
  feedback.textContent = '';
  feedback.className = 'feedback';

  let settings;
  try {
    settings = readSettingsFromForm();
  } catch (error) {
    feedback.textContent = error.message;
    return;
  }

  const response = await sendMessage({ type: 'UPDATE_SETTINGS', settings });

  if (!response?.ok) {
    feedback.textContent = response?.error ?? 'Failed to save settings.';
    return;
  }

  feedback.textContent = 'Saved';
  feedback.className = 'feedback success';
  await loadStatusAndSettings();
}

$('settings-form').addEventListener('submit', (event) => {
  handleSave(event).catch((error) => {
    $('feedback').textContent = error.message;
    $('feedback').className = 'feedback';
  });
});

loadStatusAndSettings().catch((error) => {
  $('feedback').textContent = error.message;
  $('feedback').className = 'feedback';
});
