import { minutesFromSeconds, secondsFromMinutes } from '../core/config.mjs';

let currentSettings = null;

function $(id) {
  return document.getElementById(id);
}

function setFeedback(message, success = false) {
  const feedback = $('feedback');
  feedback.textContent = message;
  feedback.className = success ? 'feedback success' : 'feedback';
}

async function sendMessage(payload) {
  return chrome.runtime.sendMessage(payload);
}

function createSiteCard(site) {
  const template = $('site-template');
  const card = template.content.firstElementChild.cloneNode(true);

  card.querySelector('.site-id').value = site.id;
  card.querySelector('.site-label').value = site.label;
  card.querySelector('.site-domains').value = site.domains.join(', ');
  card.querySelector('.site-daily').value = String(minutesFromSeconds(site.dailyLimitSec));
  card.querySelector('.site-session').value = String(minutesFromSeconds(site.sessionLimitSec));
  card.querySelector('.site-cooldown').value = String(minutesFromSeconds(site.cooldownSec));
  card.querySelector('.site-enabled').checked = site.enabled !== false;

  card.querySelector('.remove-site').addEventListener('click', () => {
    card.remove();
  });

  return card;
}

function renderSites() {
  const container = $('sites-container');
  container.textContent = '';

  for (const site of currentSettings.sites) {
    container.appendChild(createSiteCard(site));
  }
}

function readSitesFromDom() {
  const cards = Array.from(document.querySelectorAll('.site-card'));

  if (cards.length === 0) {
    throw new Error('At least one site is required.');
  }

  return cards.map((card) => {
    const id = card.querySelector('.site-id').value.trim();
    const label = card.querySelector('.site-label').value.trim();
    const domains = card
      .querySelector('.site-domains')
      .value.split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const dailyLimitSec = secondsFromMinutes(card.querySelector('.site-daily').value);
    const sessionLimitSec = secondsFromMinutes(card.querySelector('.site-session').value);
    const cooldownSec = secondsFromMinutes(card.querySelector('.site-cooldown').value);

    if (!dailyLimitSec || !sessionLimitSec || !cooldownSec) {
      throw new Error(`Invalid numeric limits for ${label || id || 'a site'}.`);
    }

    if (sessionLimitSec > dailyLimitSec) {
      throw new Error(`Session limit cannot exceed daily limit (${label || id || 'site'}).`);
    }

    if (domains.length === 0) {
      throw new Error(`Please provide at least one domain for ${label || id || 'a site'}.`);
    }

    return {
      id,
      label,
      domains,
      dailyLimitSec,
      sessionLimitSec,
      cooldownSec,
      enabled: card.querySelector('.site-enabled').checked,
    };
  });
}

function fillControls(settings) {
  $('warning-enabled').checked = settings.warning.enabled;
  $('warning-threshold').value = String(settings.warning.thresholdSec);
  $('warning-notify').checked = settings.warning.notify;

  $('overlay-enabled').checked = settings.ui.overlayEnabled;
  $('overlay-position').value = settings.ui.position;

  $('breakglass-enabled').checked = settings.breakGlass.enabled;
  $('breakglass-duration').value = String(minutesFromSeconds(settings.breakGlass.durationSec));
  $('breakglass-max-uses').value = String(settings.breakGlass.maxUsesPerDay);
}

function readSettingsFromDom() {
  const sites = readSitesFromDom();

  const warningThreshold = Number($('warning-threshold').value);
  if (!Number.isFinite(warningThreshold) || warningThreshold <= 0) {
    throw new Error('Warning threshold must be a positive number.');
  }

  const breakGlassDurationSec = secondsFromMinutes($('breakglass-duration').value);
  const maxUses = Number($('breakglass-max-uses').value);
  if (!breakGlassDurationSec || !Number.isInteger(maxUses) || maxUses <= 0) {
    throw new Error('Break-glass policy values are invalid.');
  }

  return {
    version: 2,
    sites,
    warning: {
      enabled: $('warning-enabled').checked,
      thresholdSec: Math.floor(warningThreshold),
      notify: $('warning-notify').checked,
    },
    breakGlass: {
      enabled: $('breakglass-enabled').checked,
      durationSec: breakGlassDurationSec,
      maxUsesPerDay: maxUses,
    },
    ui: {
      overlayEnabled: $('overlay-enabled').checked,
      position: $('overlay-position').value,
    },
  };
}

async function loadSettings() {
  const response = await sendMessage({ type: 'GET_STATUS' });
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to load settings.');
  }

  currentSettings = response.status.settings;
  fillControls(currentSettings);
  renderSites();
}

async function saveSettings() {
  const settings = readSettingsFromDom();
  const response = await sendMessage({ type: 'UPDATE_SETTINGS', settings });

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to save settings.');
  }

  currentSettings = response.settings;
  setFeedback('Settings saved', true);
  fillControls(currentSettings);
  renderSites();
}

async function setPin(event) {
  event.preventDefault();
  const pin = $('pin-input').value;

  const response = await sendMessage({
    type: 'SET_BREAK_GLASS_PIN',
    pin,
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to set PIN.');
  }

  $('pin-input').value = '';
  setFeedback('PIN updated', true);
  await loadSettings();
}

async function clearPin() {
  const response = await sendMessage({
    type: 'SET_BREAK_GLASS_PIN',
    clear: true,
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to clear PIN.');
  }

  setFeedback('PIN cleared', true);
  await loadSettings();
}

$('add-site').addEventListener('click', () => {
  const newCard = createSiteCard({
    id: '',
    label: 'New Site',
    domains: ['example.com'],
    dailyLimitSec: 1800,
    sessionLimitSec: 600,
    cooldownSec: 120,
    enabled: true,
  });
  $('sites-container').appendChild(newCard);
});

$('save-settings').addEventListener('click', () => {
  saveSettings().catch((error) => setFeedback(error.message));
});

$('pin-form').addEventListener('submit', (event) => {
  setPin(event).catch((error) => setFeedback(error.message));
});

$('clear-pin').addEventListener('click', () => {
  clearPin().catch((error) => setFeedback(error.message));
});

loadSettings().catch((error) => setFeedback(error.message));
