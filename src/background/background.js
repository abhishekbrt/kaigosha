import { DEFAULT_SETTINGS, SITE_KEYS, normalizeSettings } from '../core/config.mjs';
import {
  applyHeartbeat,
  createInitialRuntimeState,
  ensureCurrentDayState,
  isBlocked,
  normalizeRuntimeState,
} from '../core/state.mjs';
import { getSiteKeyFromUrl } from '../core/sites.mjs';

const STORAGE_KEYS = {
  settings: 'settings',
  runtime: 'runtime',
};

const HEARTBEAT_ALARM = 'kaigosha-heartbeat-tick';

let cache = null;
let loadPromise = null;

function getNowTs() {
  return Date.now();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInitialRuntimeMap(nowTs) {
  const runtime = {};
  for (const siteKey of SITE_KEYS) {
    runtime[siteKey] = createInitialRuntimeState(nowTs);
  }
  return runtime;
}

function getDefaultStore(nowTs) {
  return {
    settings: deepClone(DEFAULT_SETTINGS),
    runtime: createInitialRuntimeMap(nowTs),
  };
}

function normalizeRuntimeMap(rawRuntime, nowTs) {
  const runtime = {};
  for (const siteKey of SITE_KEYS) {
    runtime[siteKey] = normalizeRuntimeState(rawRuntime?.[siteKey], nowTs);
  }
  return runtime;
}

async function persistStore() {
  if (!cache) {
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: cache.settings,
    [STORAGE_KEYS.runtime]: cache.runtime,
  });
}

async function loadStore() {
  if (cache) {
    return cache;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const nowTs = getNowTs();
    const stored = await chrome.storage.local.get([STORAGE_KEYS.settings, STORAGE_KEYS.runtime]);

    cache = {
      settings: normalizeSettings(stored[STORAGE_KEYS.settings]),
      runtime: normalizeRuntimeMap(stored[STORAGE_KEYS.runtime], nowTs),
    };

    await persistStore();
    return cache;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function calculateHeartbeatDeltaSec(lastHeartbeatTs, nowTs) {
  if (!Number.isFinite(lastHeartbeatTs)) {
    return 1;
  }

  const deltaMs = nowTs - lastHeartbeatTs;
  if (deltaMs <= 0) {
    return 0;
  }

  const deltaSec = Math.floor(deltaMs / 1000);
  return Math.min(deltaSec, 5);
}

function getRemainingSec(blockedUntilTs, nowTs) {
  if (!Number.isFinite(blockedUntilTs)) {
    return 0;
  }
  return Math.max(0, Math.ceil((blockedUntilTs - nowTs) / 1000));
}

function getBlockReason(mode) {
  return mode === 'DAILY_BLOCK' ? 'daily' : 'cooldown';
}

function buildBlockUrl(siteKey, reason) {
  const params = new URLSearchParams({ site: siteKey, reason });
  return chrome.runtime.getURL(`src/block/block.html?${params.toString()}`);
}

async function updateSiteForNow(siteKey, nowTs) {
  const store = await loadStore();
  const currentState = store.runtime[siteKey] ?? createInitialRuntimeState(nowTs);
  const nextState = applyHeartbeat(currentState, store.settings[siteKey], nowTs, 0);

  store.runtime[siteKey] = ensureCurrentDayState(nextState, nowTs);
  return store.runtime[siteKey];
}

async function maybeRedirectBlockedTab(tabId, url) {
  const siteKey = getSiteKeyFromUrl(url);
  if (!siteKey) {
    return;
  }

  const nowTs = getNowTs();
  const state = await updateSiteForNow(siteKey, nowTs);
  if (!isBlocked(state, nowTs)) {
    await persistStore();
    return;
  }

  const blockUrl = buildBlockUrl(siteKey, getBlockReason(state.mode));
  try {
    await chrome.tabs.update(tabId, { url: blockUrl });
  } catch {
    // Tab may no longer exist.
  }

  await persistStore();
}

async function refreshRuntimeStates() {
  const nowTs = getNowTs();
  const store = await loadStore();
  for (const siteKey of SITE_KEYS) {
    store.runtime[siteKey] = updateStateWithoutCounting(store.runtime[siteKey], store.settings[siteKey], nowTs);
  }
  await persistStore();
}

function updateStateWithoutCounting(state, config, nowTs) {
  return applyHeartbeat(ensureCurrentDayState(state, nowTs), config, nowTs, 0);
}

function formatSiteStatus(siteKey, state, config, nowTs) {
  const blocked = isBlocked(state, nowTs);
  const reason = blocked ? getBlockReason(state.mode) : null;

  return {
    siteKey,
    mode: state.mode,
    blocked,
    reason,
    blockedUntilTs: state.blockedUntilTs,
    remainingSec: blocked ? getRemainingSec(state.blockedUntilTs, nowTs) : 0,
    dailyUsedSec: state.dailyUsedSec,
    dailyRemainingSec: Math.max(0, config.dailyLimitSec - state.dailyUsedSec),
    sessionUsedSec: state.sessionUsedSec,
    sessionRemainingSec: Math.max(0, config.sessionLimitSec - state.sessionUsedSec),
    config,
  };
}

async function getAllStatuses() {
  const nowTs = getNowTs();
  const store = await loadStore();

  const statuses = {};
  for (const siteKey of SITE_KEYS) {
    const state = updateStateWithoutCounting(store.runtime[siteKey], store.settings[siteKey], nowTs);
    store.runtime[siteKey] = state;
    statuses[siteKey] = formatSiteStatus(siteKey, state, store.settings[siteKey], nowTs);
  }

  await persistStore();

  return {
    nowTs,
    sites: statuses,
    settings: store.settings,
  };
}

async function handleHeartbeat(message, sender) {
  const siteKey = getSiteKeyFromUrl(message.url);
  if (!siteKey) {
    return { ok: true, ignored: true };
  }

  const nowTs = getNowTs();
  const store = await loadStore();

  const currentState = updateStateWithoutCounting(store.runtime[siteKey], store.settings[siteKey], nowTs);
  const deltaSec = calculateHeartbeatDeltaSec(currentState.lastHeartbeatTs, nowTs);
  const nextState = applyHeartbeat(currentState, store.settings[siteKey], nowTs, deltaSec);

  store.runtime[siteKey] = nextState;
  await persistStore();

  if (isBlocked(nextState, nowTs) && sender.tab?.id) {
    const reason = getBlockReason(nextState.mode);
    await maybeRedirectBlockedTab(sender.tab.id, message.url);
    return { ok: true, siteKey, blocked: true, reason };
  }

  return { ok: true, siteKey, blocked: false };
}

async function handleSettingsUpdate(message) {
  const store = await loadStore();
  store.settings = normalizeSettings(message.settings);
  const nowTs = getNowTs();
  for (const siteKey of SITE_KEYS) {
    store.runtime[siteKey] = updateStateWithoutCounting(store.runtime[siteKey], store.settings[siteKey], nowTs);
  }

  await persistStore();
  return { ok: true, settings: store.settings };
}

async function enforceAllOpenTrackedTabs() {
  const tabs = await chrome.tabs.query({
    url: [
      '*://x.com/*',
      '*://*.x.com/*',
      '*://twitter.com/*',
      '*://*.twitter.com/*',
      '*://instagram.com/*',
      '*://*.instagram.com/*',
    ],
  });

  for (const tab of tabs) {
    if (!tab.id || !tab.url) {
      continue;
    }
    await maybeRedirectBlockedTab(tab.id, tab.url);
  }
}

function installAlarm() {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
}

async function boot() {
  await loadStore();
  installAlarm();
  await refreshRuntimeStates();
  await enforceAllOpenTrackedTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  boot().catch(() => {
    cache = getDefaultStore(getNowTs());
  });
});

chrome.runtime.onStartup.addListener(() => {
  boot().catch(() => {
    cache = getDefaultStore(getNowTs());
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url ?? tab.url;
  if (!targetUrl) {
    return;
  }

  maybeRedirectBlockedTab(tabId, targetUrl).catch(() => {});
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) {
      return;
    }

    await maybeRedirectBlockedTab(tabId, tab.url);
  } catch {
    // Tab was closed or unavailable.
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) {
    return;
  }

  refreshRuntimeStates()
    .then(enforceAllOpenTrackedTabs)
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (message.type === 'HEARTBEAT') {
    handleHeartbeat(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_STATUS') {
    getAllStatuses()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_SITE_STATUS' && typeof message.siteKey === 'string') {
    getAllStatuses()
      .then((status) => sendResponse({ ok: true, site: status.sites[message.siteKey] ?? null, nowTs: status.nowTs }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'UPDATE_SETTINGS' && typeof message.settings === 'object') {
    handleSettingsUpdate(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

boot().catch(() => {
  cache = getDefaultStore(getNowTs());
});
