import {
  DEFAULT_V2_SETTINGS,
  SETTINGS_VERSION,
  normalizeSettings,
} from '../core/config.mjs';
import {
  applyHeartbeat,
  createInitialRuntimeState,
  ensureCurrentDayState,
  isBlocked,
  markWarningIssued,
  normalizeRuntimeState,
} from '../core/state.mjs';
import {
  activateBreakGlass,
  canActivateBreakGlass,
  createInitialBreakGlassRuntime,
  isBreakGlassActive,
  normalizeBreakGlassRuntime,
} from '../core/break-glass.mjs';
import { compileSiteMatchers, getMatchedSiteFromUrl } from '../core/sites.mjs';

const STORAGE_SYNC_KEYS = {
  settings: 'settings_v2',
};

const STORAGE_LOCAL_KEYS = {
  settingsBackup: 'settings_v2_backup',
  runtime: 'runtime_v2',
  legacySettings: 'settings',
  legacyRuntime: 'runtime',
  breakGlassRuntime: 'break_glass_runtime_v2',
  diagnostics: 'diagnostics_v2',
  eventLog: 'event_log_v2',
};

const HEARTBEAT_ALARM = 'kaigosha-heartbeat-tick';
const MAX_EVENT_LOG = 500;
const BLOCK_PAGE_PATH = 'src/block/block.html';
const NOTIFICATION_ICON_PATH = 'src/assets/notify.png';

let cache = null;
let loadPromise = null;

function getNowTs() {
  return Date.now();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toDayKey(timestampMs) {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDiagnostics(rawDiagnostics, nowTs) {
  if (!rawDiagnostics || typeof rawDiagnostics !== 'object') {
    return {
      lastBootTs: nowTs,
      lastError: null,
      storageMigrationsApplied: [],
    };
  }

  return {
    lastBootTs: Number.isFinite(rawDiagnostics.lastBootTs) ? rawDiagnostics.lastBootTs : nowTs,
    lastError: rawDiagnostics.lastError && typeof rawDiagnostics.lastError === 'object' ? rawDiagnostics.lastError : null,
    storageMigrationsApplied: Array.isArray(rawDiagnostics.storageMigrationsApplied)
      ? rawDiagnostics.storageMigrationsApplied.filter((entry) => typeof entry === 'string')
      : [],
  };
}

function normalizeEventLog(rawEventLog) {
  if (!Array.isArray(rawEventLog)) {
    return [];
  }

  return rawEventLog
    .filter((entry) => entry && typeof entry === 'object' && Number.isFinite(entry.ts) && typeof entry.type === 'string')
    .slice(-MAX_EVENT_LOG);
}

function normalizeRuntimeBySites(rawRuntime, sites, nowTs) {
  const runtimeBySiteId = {};

  for (const site of sites) {
    runtimeBySiteId[site.id] = normalizeRuntimeState(rawRuntime?.[site.id], nowTs);
  }

  return runtimeBySiteId;
}

function rebuildMatchers() {
  cache.matchers = compileSiteMatchers(cache.settings.sites);
}

function appendEvent(type, siteId = null, details = {}) {
  if (!cache) {
    return;
  }

  cache.eventLog.push({
    ts: getNowTs(),
    type,
    siteId,
    details,
  });

  if (cache.eventLog.length > MAX_EVENT_LOG) {
    cache.eventLog = cache.eventLog.slice(-MAX_EVENT_LOG);
  }
}

function setLastError(context, error) {
  if (!cache) {
    return;
  }

  cache.diagnostics.lastError = {
    ts: getNowTs(),
    context,
    message: error instanceof Error ? error.message : String(error),
  };
}

function addMigrationNote(note) {
  if (!cache || !note) {
    return;
  }

  if (!cache.diagnostics.storageMigrationsApplied.includes(note)) {
    cache.diagnostics.storageMigrationsApplied.push(note);
  }
}

async function safeSyncGet(keys) {
  try {
    return await chrome.storage.sync.get(keys);
  } catch {
    return {};
  }
}

async function safeSyncSet(payload) {
  try {
    await chrome.storage.sync.set(payload);
    return true;
  } catch (error) {
    setLastError('sync.set', error);
    appendEvent('sync_write_failed', null, {});
    return false;
  }
}

async function persistSettings() {
  if (!cache) {
    return;
  }

  await safeSyncSet({
    [STORAGE_SYNC_KEYS.settings]: cache.settings,
  });

  await chrome.storage.local.set({
    [STORAGE_LOCAL_KEYS.settingsBackup]: cache.settings,
  });
}

async function persistLocalState() {
  if (!cache) {
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_LOCAL_KEYS.runtime]: cache.runtimeBySiteId,
    [STORAGE_LOCAL_KEYS.breakGlassRuntime]: cache.breakGlassRuntime,
    [STORAGE_LOCAL_KEYS.diagnostics]: cache.diagnostics,
    [STORAGE_LOCAL_KEYS.eventLog]: cache.eventLog,
  });
}

async function persistAll() {
  await persistSettings();
  await persistLocalState();
}

function getSiteById(siteId) {
  return cache.settings.sites.find((site) => site.id === siteId) ?? null;
}

function getSiteByUrl(url) {
  const matched = getMatchedSiteFromUrl(url, cache.matchers);
  if (!matched) {
    return null;
  }

  return getSiteById(matched.id);
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

function getRemainingSec(targetTs, nowTs) {
  if (!Number.isFinite(targetTs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((targetTs - nowTs) / 1000));
}

function getBlockReason(mode) {
  return mode === 'DAILY_BLOCK' ? 'daily' : 'cooldown';
}

function ensureRuntimeCurrentDay(siteId, nowTs) {
  const runtimeState = cache.runtimeBySiteId[siteId] ?? createInitialRuntimeState(nowTs);
  const normalizedState = ensureCurrentDayState(runtimeState, nowTs);
  cache.runtimeBySiteId[siteId] = normalizedState;
  return normalizedState;
}

function updateStateWithoutCounting(site, nowTs) {
  const current = ensureRuntimeCurrentDay(site.id, nowTs);
  const updated = applyHeartbeat(current, site, nowTs, 0);
  cache.runtimeBySiteId[site.id] = updated;
  return updated;
}

function computeSiteStatus(site, state, nowTs) {
  const policyBlocked = isBlocked(state, nowTs);
  const breakGlassActive = isBreakGlassActive(cache.breakGlassRuntime, site.id, nowTs);
  const blocked = policyBlocked && !breakGlassActive;

  const breakGlassRemainingSec = cache.breakGlassRuntime.active
    ? getRemainingSec(cache.breakGlassRuntime.active.untilTs, nowTs)
    : 0;

  return {
    id: site.id,
    siteKey: site.id,
    label: site.label,
    domains: [...site.domains],
    mode: state.mode,
    blocked,
    policyBlocked,
    breakGlassActive,
    breakGlassRemainingSec,
    reason: policyBlocked ? getBlockReason(state.mode) : null,
    blockedUntilTs: state.blockedUntilTs,
    remainingSec: policyBlocked ? getRemainingSec(state.blockedUntilTs, nowTs) : 0,
    dailyUsedSec: state.dailyUsedSec,
    dailyRemainingSec: Math.max(0, site.dailyLimitSec - state.dailyUsedSec),
    sessionUsedSec: state.sessionUsedSec,
    sessionRemainingSec: Math.max(0, site.sessionLimitSec - state.sessionUsedSec),
    config: {
      dailyLimitSec: site.dailyLimitSec,
      sessionLimitSec: site.sessionLimitSec,
      cooldownSec: site.cooldownSec,
    },
  };
}

function getAllSiteStatuses(nowTs) {
  const statuses = [];

  for (const site of cache.settings.sites) {
    const state = updateStateWithoutCounting(site, nowTs);
    statuses.push(computeSiteStatus(site, state, nowTs));
  }

  return statuses;
}

function buildStatusPayload(nowTs) {
  const statuses = getAllSiteStatuses(nowTs);
  const sitesById = Object.fromEntries(statuses.map((siteStatus) => [siteStatus.id, siteStatus]));

  return {
    nowTs,
    settings: cache.settings,
    breakGlassRuntime: cache.breakGlassRuntime,
    sites: statuses,
    sitesById,
  };
}

function buildBlockUrl(siteId, reason, returnUrl) {
  const params = new URLSearchParams({ siteId, reason });
  if (returnUrl) {
    params.set('returnUrl', returnUrl);
  }

  return chrome.runtime.getURL(`${BLOCK_PAGE_PATH}?${params.toString()}`);
}

function isExtensionBlockUrl(url) {
  return typeof url === 'string' && url.startsWith(chrome.runtime.getURL(BLOCK_PAGE_PATH));
}

async function maybeRedirectBlockedTab(tabId, url) {
  if (!url || isExtensionBlockUrl(url)) {
    return;
  }

  const site = getSiteByUrl(url);
  if (!site) {
    return;
  }

  const nowTs = getNowTs();
  cache.breakGlassRuntime = normalizeBreakGlassRuntime(cache.breakGlassRuntime, nowTs);

  const state = updateStateWithoutCounting(site, nowTs);
  const status = computeSiteStatus(site, state, nowTs);

  if (!status.blocked) {
    await persistLocalState();
    return;
  }

  const blockUrl = buildBlockUrl(site.id, status.reason ?? 'cooldown', url);

  try {
    await chrome.tabs.update(tabId, { url: blockUrl });
    appendEvent('tab_redirect_blocked', site.id, { reason: status.reason });
  } catch {
    // Tab can disappear between event and update.
  }

  await persistLocalState();
}

async function refreshRuntimeStates() {
  const nowTs = getNowTs();
  cache.breakGlassRuntime = normalizeBreakGlassRuntime(cache.breakGlassRuntime, nowTs);

  for (const site of cache.settings.sites) {
    cache.runtimeBySiteId[site.id] = updateStateWithoutCounting(site, nowTs);
  }

  await persistLocalState();
}

async function enforceAllOpenTrackedTabs() {
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (!tab.id || !tab.url) {
      continue;
    }

    await maybeRedirectBlockedTab(tab.id, tab.url);
  }
}

async function sendWarningNotification(site, sessionRemainingSec) {
  const title = `${site.label} session ending soon`;
  const message = `${Math.max(1, Math.ceil(sessionRemainingSec / 60))} minute remaining before cooldown.`;

  try {
    await chrome.notifications.create(`warning-${site.id}-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON_PATH),
      title,
      message,
      priority: 2,
    });
  } catch (error) {
    setLastError('notifications.create', error);
  }
}

function maybeIssueSessionWarning(site, state, nowTs) {
  if (!cache.settings.warning.enabled) {
    return state;
  }

  if (state.mode !== 'ALLOWED' || state.warningIssuedForSession) {
    return state;
  }

  const sessionRemainingSec = Math.max(0, site.sessionLimitSec - state.sessionUsedSec);
  if (sessionRemainingSec === 0 || sessionRemainingSec > cache.settings.warning.thresholdSec) {
    return state;
  }

  const warnedState = markWarningIssued(state);
  appendEvent('session_warning', site.id, { sessionRemainingSec });

  if (cache.settings.warning.notify) {
    sendWarningNotification(site, sessionRemainingSec).catch(() => {});
  }

  return warnedState;
}

async function handleHeartbeat(message, sender) {
  const site = getSiteByUrl(message.url);
  if (!site) {
    return {
      ok: true,
      ignored: true,
      site: null,
      ui: cache.settings.ui,
    };
  }

  const nowTs = getNowTs();
  cache.breakGlassRuntime = normalizeBreakGlassRuntime(cache.breakGlassRuntime, nowTs);

  const current = updateStateWithoutCounting(site, nowTs);
  const deltaSec = calculateHeartbeatDeltaSec(current.lastHeartbeatTs, nowTs);

  let next = applyHeartbeat(current, site, nowTs, deltaSec);
  next = maybeIssueSessionWarning(site, next, nowTs);
  cache.runtimeBySiteId[site.id] = next;

  const status = computeSiteStatus(site, next, nowTs);

  if (status.blocked && sender.tab?.id) {
    await maybeRedirectBlockedTab(sender.tab.id, message.url);
  }

  await persistLocalState();

  return {
    ok: true,
    site: status,
    ui: cache.settings.ui,
  };
}

function normalizeSettingsUpdatePayload(rawSettings) {
  const normalized = normalizeSettings(rawSettings);

  // Keep existing PIN when payload does not include credentials explicitly.
  if (!rawSettings?.breakGlass?.pinHash && cache.settings.breakGlass.pinHash) {
    normalized.breakGlass.pinHash = cache.settings.breakGlass.pinHash;
    normalized.breakGlass.pinSalt = cache.settings.breakGlass.pinSalt;
  }

  return normalized;
}

function reconcileRuntimeWithSettings(nowTs) {
  cache.runtimeBySiteId = normalizeRuntimeBySites(cache.runtimeBySiteId, cache.settings.sites, nowTs);
  cache.breakGlassRuntime = normalizeBreakGlassRuntime(cache.breakGlassRuntime, nowTs);

  if (cache.breakGlassRuntime.active && !getSiteById(cache.breakGlassRuntime.active.siteId)) {
    cache.breakGlassRuntime.active = null;
  }

  rebuildMatchers();
}

async function updateSettings(nextSettings) {
  cache.settings = normalizeSettingsUpdatePayload(nextSettings);
  reconcileRuntimeWithSettings(getNowTs());
  appendEvent('settings_updated', null, { siteCount: cache.settings.sites.length });
  await persistAll();
}

function sanitizeId(value) {
  if (typeof value !== 'string') {
    return 'site';
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'site';
}

function makeUniqueSiteId(baseId, existingIds) {
  const normalized = sanitizeId(baseId);
  if (!existingIds.has(normalized)) {
    return normalized;
  }

  let index = 2;
  while (existingIds.has(`${normalized}-${index}`)) {
    index += 1;
  }

  return `${normalized}-${index}`;
}

async function handleAddSite(message) {
  const existingIds = new Set(cache.settings.sites.map((site) => site.id));
  const baseId = message.site?.id || message.site?.label || 'site';
  const siteId = makeUniqueSiteId(baseId, existingIds);

  const nextSettings = deepClone(cache.settings);
  nextSettings.sites.push({
    id: siteId,
    label: message.site?.label,
    domains: Array.isArray(message.site?.domains) ? message.site.domains : [],
    dailyLimitSec: message.site?.dailyLimitSec,
    sessionLimitSec: message.site?.sessionLimitSec,
    cooldownSec: message.site?.cooldownSec,
    enabled: message.site?.enabled,
  });

  await updateSettings(nextSettings);
  appendEvent('site_added', siteId, {});

  return { ok: true, settings: cache.settings };
}

async function handleUpdateSite(message) {
  if (typeof message.siteId !== 'string') {
    return { ok: false, error: 'Missing site id.' };
  }

  const index = cache.settings.sites.findIndex((site) => site.id === message.siteId);
  if (index === -1) {
    return { ok: false, error: 'Site not found.' };
  }

  const nextSettings = deepClone(cache.settings);
  nextSettings.sites[index] = {
    ...nextSettings.sites[index],
    ...message.patch,
    id: nextSettings.sites[index].id,
  };

  await updateSettings(nextSettings);
  appendEvent('site_updated', message.siteId, {});

  return { ok: true, settings: cache.settings };
}

async function handleDeleteSite(message) {
  if (typeof message.siteId !== 'string') {
    return { ok: false, error: 'Missing site id.' };
  }

  const nextSites = cache.settings.sites.filter((site) => site.id !== message.siteId);
  if (nextSites.length === 0) {
    return { ok: false, error: 'At least one site is required.' };
  }

  const nextSettings = {
    ...deepClone(cache.settings),
    sites: nextSites,
  };

  await updateSettings(nextSettings);

  if (cache.breakGlassRuntime.active?.siteId === message.siteId) {
    cache.breakGlassRuntime.active = null;
  }

  delete cache.runtimeBySiteId[message.siteId];
  appendEvent('site_deleted', message.siteId, {});
  await persistLocalState();

  return { ok: true, settings: cache.settings };
}

function bytesToHex(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createSaltHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

async function hashPin(pin, salt) {
  return sha256Hex(`${salt}:${pin}`);
}

async function handleSetBreakGlassPin(message) {
  if (message.clear === true) {
    const nextSettings = deepClone(cache.settings);
    nextSettings.breakGlass.pinHash = null;
    nextSettings.breakGlass.pinSalt = null;
    await updateSettings(nextSettings);
    appendEvent('break_glass_pin_cleared', null, {});
    return { ok: true };
  }

  if (typeof message.pin !== 'string' || message.pin.length < 4) {
    return { ok: false, error: 'PIN must be at least 4 characters.' };
  }

  const salt = createSaltHex();
  const pinHash = await hashPin(message.pin, salt);

  const nextSettings = deepClone(cache.settings);
  nextSettings.breakGlass.pinHash = pinHash;
  nextSettings.breakGlass.pinSalt = salt;
  await updateSettings(nextSettings);

  appendEvent('break_glass_pin_set', null, {});
  return { ok: true };
}

async function verifyBreakGlassPin(pin) {
  const { pinHash, pinSalt } = cache.settings.breakGlass;
  if (!pinHash || !pinSalt || typeof pin !== 'string') {
    return false;
  }

  const candidate = await hashPin(pin, pinSalt);
  return candidate === pinHash;
}

async function handleActivateBreakGlass(message) {
  if (typeof message.siteId !== 'string') {
    return { ok: false, error: 'Missing site id.' };
  }

  const site = getSiteById(message.siteId);
  if (!site) {
    return { ok: false, error: 'Site not found.' };
  }

  if (!cache.settings.breakGlass.enabled) {
    return { ok: false, error: 'Break-glass is disabled.' };
  }

  if (!cache.settings.breakGlass.pinHash || !cache.settings.breakGlass.pinSalt) {
    return { ok: false, error: 'Break-glass PIN is not configured.' };
  }

  const pinValid = await verifyBreakGlassPin(message.pin);
  if (!pinValid) {
    return { ok: false, error: 'Invalid PIN.' };
  }

  const nowTs = getNowTs();
  cache.breakGlassRuntime = normalizeBreakGlassRuntime(cache.breakGlassRuntime, nowTs);

  if (!canActivateBreakGlass(cache.breakGlassRuntime, cache.settings.breakGlass, nowTs)) {
    return { ok: false, error: 'Daily break-glass usage limit reached.' };
  }

  cache.breakGlassRuntime = activateBreakGlass(cache.breakGlassRuntime, cache.settings.breakGlass, site.id, nowTs);
  appendEvent('break_glass_activated', site.id, {
    untilTs: cache.breakGlassRuntime.active?.untilTs ?? null,
  });

  await persistLocalState();
  await enforceAllOpenTrackedTabs();

  return {
    ok: true,
    breakGlassRuntime: cache.breakGlassRuntime,
  };
}

async function handleToggleOverlay(message) {
  if (typeof message.enabled !== 'boolean') {
    return { ok: false, error: 'Missing enabled flag.' };
  }

  const nextSettings = deepClone(cache.settings);
  nextSettings.ui.overlayEnabled = message.enabled;
  await updateSettings(nextSettings);

  appendEvent('overlay_toggled', null, { enabled: message.enabled });
  return { ok: true, ui: cache.settings.ui };
}

async function handleGetSiteStatus(message) {
  const site = typeof message.siteId === 'string' ? getSiteById(message.siteId) : getSiteByUrl(message.url);
  if (!site) {
    return {
      ok: true,
      site: null,
      ui: cache.settings.ui,
    };
  }

  const nowTs = getNowTs();
  cache.breakGlassRuntime = normalizeBreakGlassRuntime(cache.breakGlassRuntime, nowTs);
  const state = updateStateWithoutCounting(site, nowTs);
  const status = computeSiteStatus(site, state, nowTs);
  await persistLocalState();

  return {
    ok: true,
    site: status,
    ui: cache.settings.ui,
  };
}

async function handleGetStatus() {
  const nowTs = getNowTs();
  cache.breakGlassRuntime = normalizeBreakGlassRuntime(cache.breakGlassRuntime, nowTs);
  const status = buildStatusPayload(nowTs);
  await persistLocalState();

  return {
    ok: true,
    status,
  };
}

async function handleGetDiagnostics() {
  const nowTs = getNowTs();
  const status = buildStatusPayload(nowTs);

  return {
    ok: true,
    diagnostics: {
      nowTs,
      diagnostics: cache.diagnostics,
      eventLog: cache.eventLog,
      runtimeBySiteId: cache.runtimeBySiteId,
      breakGlassRuntime: cache.breakGlassRuntime,
      settings: cache.settings,
      status,
    },
  };
}

async function handleClearDiagnostics() {
  cache.eventLog = [];
  cache.diagnostics.lastError = null;
  appendEvent('diagnostics_cleared', null, {});
  await persistLocalState();

  return { ok: true };
}

function installAlarm() {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
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
    const localStored = await chrome.storage.local.get([
      STORAGE_LOCAL_KEYS.settingsBackup,
      STORAGE_LOCAL_KEYS.legacySettings,
      STORAGE_LOCAL_KEYS.runtime,
      STORAGE_LOCAL_KEYS.legacyRuntime,
      STORAGE_LOCAL_KEYS.breakGlassRuntime,
      STORAGE_LOCAL_KEYS.diagnostics,
      STORAGE_LOCAL_KEYS.eventLog,
    ]);

    const syncStored = await safeSyncGet([STORAGE_SYNC_KEYS.settings]);

    let rawSettings = syncStored[STORAGE_SYNC_KEYS.settings];
    if (!rawSettings) {
      rawSettings = localStored[STORAGE_LOCAL_KEYS.settingsBackup] ?? localStored[STORAGE_LOCAL_KEYS.legacySettings] ?? DEFAULT_V2_SETTINGS;
    }

    const settings = normalizeSettings(rawSettings);

    cache = {
      settings,
      matchers: compileSiteMatchers(settings.sites),
      runtimeBySiteId: normalizeRuntimeBySites(
        localStored[STORAGE_LOCAL_KEYS.runtime] ?? localStored[STORAGE_LOCAL_KEYS.legacyRuntime],
        settings.sites,
        nowTs
      ),
      breakGlassRuntime: normalizeBreakGlassRuntime(localStored[STORAGE_LOCAL_KEYS.breakGlassRuntime], nowTs),
      diagnostics: normalizeDiagnostics(localStored[STORAGE_LOCAL_KEYS.diagnostics], nowTs),
      eventLog: normalizeEventLog(localStored[STORAGE_LOCAL_KEYS.eventLog]),
    };

    if (rawSettings?.version !== SETTINGS_VERSION) {
      addMigrationNote('settings_migrated_to_v2');
    }

    if (localStored[STORAGE_LOCAL_KEYS.legacyRuntime] && !localStored[STORAGE_LOCAL_KEYS.runtime]) {
      addMigrationNote('runtime_migrated_to_v2');
    }

    appendEvent('boot_loaded', null, { siteCount: settings.sites.length });
    await persistAll();

    return cache;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

async function boot() {
  await loadStore();
  cache.diagnostics.lastBootTs = getNowTs();
  installAlarm();
  await refreshRuntimeStates();
  await enforceAllOpenTrackedTabs();
  await persistLocalState();
}

async function safeHandle(handler, sendResponse) {
  try {
    const response = await handler();
    sendResponse(response);
  } catch (error) {
    setLastError('runtime.onMessage', error);
    appendEvent('handler_error', null, {
      message: error instanceof Error ? error.message : String(error),
    });

    await persistLocalState().catch(() => {});
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  boot().catch((error) => {
    setLastError('onInstalled.boot', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  boot().catch((error) => {
    setLastError('onStartup.boot', error);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url ?? tab.url;
  if (!targetUrl) {
    return;
  }

  loadStore()
    .then(() => maybeRedirectBlockedTab(tabId, targetUrl))
    .catch(() => {});
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await loadStore();
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) {
      return;
    }

    await maybeRedirectBlockedTab(tabId, tab.url);
  } catch {
    // Ignore transient tab failures.
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!tab.id || !tab.url) {
    return;
  }

  loadStore()
    .then(() => maybeRedirectBlockedTab(tab.id, tab.url))
    .catch(() => {});
});

chrome.tabs.onReplaced.addListener((addedTabId) => {
  loadStore()
    .then(async () => {
      const tab = await chrome.tabs.get(addedTabId);
      if (!tab.url) {
        return;
      }
      await maybeRedirectBlockedTab(addedTabId, tab.url);
    })
    .catch(() => {});
});

if (chrome.webNavigation?.onCommitted) {
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0 || !details.tabId || !details.url) {
      return;
    }

    loadStore()
      .then(() => maybeRedirectBlockedTab(details.tabId, details.url))
      .catch(() => {});
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) {
    return;
  }

  loadStore()
    .then(refreshRuntimeStates)
    .then(enforceAllOpenTrackedTabs)
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const handler = async () => {
    await loadStore();

    if (message.type === 'HEARTBEAT') {
      return handleHeartbeat(message, sender);
    }

    if (message.type === 'GET_STATUS') {
      return handleGetStatus();
    }

    if (message.type === 'GET_SITE_STATUS') {
      return handleGetSiteStatus(message);
    }

    if (message.type === 'UPDATE_SETTINGS' && typeof message.settings === 'object') {
      await updateSettings(message.settings);
      return { ok: true, settings: cache.settings };
    }

    if (message.type === 'ADD_SITE' && typeof message.site === 'object') {
      return handleAddSite(message);
    }

    if (message.type === 'UPDATE_SITE') {
      return handleUpdateSite(message);
    }

    if (message.type === 'DELETE_SITE') {
      return handleDeleteSite(message);
    }

    if (message.type === 'SET_BREAK_GLASS_PIN') {
      return handleSetBreakGlassPin(message);
    }

    if (message.type === 'ACTIVATE_BREAK_GLASS') {
      return handleActivateBreakGlass(message);
    }

    if (message.type === 'TOGGLE_OVERLAY') {
      return handleToggleOverlay(message);
    }

    if (message.type === 'GET_WARNING_STATE') {
      return { ok: true, warning: cache.settings.warning };
    }

    if (message.type === 'GET_DIAGNOSTICS') {
      return handleGetDiagnostics();
    }

    if (message.type === 'CLEAR_DIAGNOSTICS') {
      return handleClearDiagnostics();
    }

    return { ok: false, error: 'Unknown message type.' };
  };

  safeHandle(handler, sendResponse);
  return true;
});

boot().catch((error) => {
  if (!cache) {
    const nowTs = getNowTs();
    cache = {
      settings: deepClone(DEFAULT_V2_SETTINGS),
      matchers: compileSiteMatchers(DEFAULT_V2_SETTINGS.sites),
      runtimeBySiteId: normalizeRuntimeBySites({}, DEFAULT_V2_SETTINGS.sites, nowTs),
      breakGlassRuntime: createInitialBreakGlassRuntime(nowTs),
      diagnostics: normalizeDiagnostics({}, nowTs),
      eventLog: [],
    };
  }

  setLastError('boot.initial', error);
});
