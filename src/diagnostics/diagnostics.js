function $(id) {
  return document.getElementById(id);
}

function setFeedback(message) {
  $('feedback').textContent = message;
}

async function loadDiagnostics() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' });
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to load diagnostics');
  }

  $('output').textContent = JSON.stringify(response.diagnostics, null, 2);
  setFeedback('');
}

async function clearDiagnostics() {
  const response = await chrome.runtime.sendMessage({ type: 'CLEAR_DIAGNOSTICS' });
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to clear diagnostics');
  }

  await loadDiagnostics();
  setFeedback('Diagnostics cleared');
}

$('refresh').addEventListener('click', () => {
  loadDiagnostics().catch((error) => setFeedback(error.message));
});

$('clear').addEventListener('click', () => {
  clearDiagnostics().catch((error) => setFeedback(error.message));
});

loadDiagnostics().catch((error) => setFeedback(error.message));
