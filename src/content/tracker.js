const HEARTBEAT_INTERVAL_MS = 1000;

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

setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

document.addEventListener('visibilitychange', sendHeartbeat);
window.addEventListener('focus', sendHeartbeat);
window.addEventListener('pageshow', sendHeartbeat);

sendHeartbeat();
