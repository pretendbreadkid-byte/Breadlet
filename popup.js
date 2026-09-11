const STORAGE_KEY = 'blooketAnonymitySettings';
const DEFAULTS = { enabled: false, replacementText: 'Anonymous' };

function getStorage() {
  return chrome.storage.sync || chrome.storage.local;
}

function normalizeSettings(rawSettings) {
  const replacementText = typeof rawSettings?.replacementText === 'string'
    ? rawSettings.replacementText.trim()
    : '';

  return {
    enabled: Boolean(rawSettings?.enabled),
    replacementText: replacementText || DEFAULTS.replacementText
  };
}

function updateStatus(message) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
  }
}

function saveSettings() {
  const toggle = document.getElementById('anonymity-toggle');
  const input = document.getElementById('replacement-input');
  const nextSettings = {
    enabled: toggle?.checked || false,
    replacementText: input?.value?.trim() || DEFAULTS.replacementText
  };

  getStorage().set({ [STORAGE_KEY]: nextSettings }, () => {
    updateStatus(nextSettings.enabled ? 'Anonymity is on.' : 'Anonymity is off.');
  });
}

function loadSettings() {
  const toggle = document.getElementById('anonymity-toggle');
  const input = document.getElementById('replacement-input');

  getStorage().get([STORAGE_KEY], (result) => {
    const settings = normalizeSettings(result[STORAGE_KEY]);
    if (toggle) {
      toggle.checked = settings.enabled;
    }
    if (input) {
      input.value = settings.replacementText;
    }
    updateStatus(settings.enabled ? 'Anonymity is on.' : 'Anonymity is off.');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('anonymity-toggle');
  const input = document.getElementById('replacement-input');

  loadSettings();

  toggle?.addEventListener('change', saveSettings);
  input?.addEventListener('input', saveSettings);
});
