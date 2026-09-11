(() => {
  const STORAGE_KEY = 'blooketAnonymitySettings';
  const DEFAULTS = { enabled: false, replacementText: 'Anonymous' };
  let currentSettings = { ...DEFAULTS };
  const originalTextMap = new WeakMap();
  const anonymizedNodes = new Set();
  let observer = null;

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

  function isInjectedUI(node) {
    if (!node) return false;
    return Boolean(node.closest('.blooket-anonymity-panel, .blooket-anonymity-launcher'));
  }

  function hasNameHint(node) {
    const value = `${node.id || ''} ${node.className || ''}`.toLowerCase();
    return /\b(name|username|displayname|player|profile|account|nick|handle|user|member)\b/.test(value);
  }

  function looksLikeNameText(text) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 30 || trimmed.length < 2) return false;
    if (!/^[A-Za-zÀ-ÿ0-9'’\- ]+$/.test(trimmed)) return false;
    if (/^(Blooket|Play|Shop|Join|Battle|Your|Score|Points|Level|Rank|Rewards|Daily|Login|Logout|Register|Settings|Profile|Premium|Daily|Home|Back|Next|Save|Send|Buy|Sell)/i.test(trimmed)) return false;
    if (/\d/.test(trimmed) && trimmed.length < 4) return false;
    const words = trimmed.split(/\s+/);
    if (words.length > 3) return false;
    return words.every((word) => word.length > 0 && word.length <= 20);
  }

  function shouldAnonymizeNode(node, allowFallback = false) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    if (isInjectedUI(node)) return false;

    const parent = node.parentElement;
    if (!parent || isInjectedUI(parent)) return false;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'IFRAME', 'OBJECT'].includes(parent.tagName)) return false;

    const text = node.nodeValue.trim();
    if (text === currentSettings.replacementText) return false;

    if (!looksLikeNameText(text)) return false;
    if (hasNameHint(parent)) return true;
    if (allowFallback && text.length <= 20 && text.split(/\s+/).length <= 2) return true;
    return false;
  }

  function collectTextNodes(root, allowFallback = false) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldAnonymizeNode(node, allowFallback) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    return nodes;
  }

  function anonymizeTextNode(node, replacement) {
    if (!originalTextMap.has(node)) {
      originalTextMap.set(node, node.nodeValue);
      anonymizedNodes.add(node);
    }
    node.nodeValue = replacement;
  }

  function restoreAnonymizedNodes() {
    anonymizedNodes.forEach((node) => {
      if (originalTextMap.has(node)) {
        node.nodeValue = originalTextMap.get(node);
      }
    });
    anonymizedNodes.clear();
  }

  function applyAnonymity(settings) {
    restoreAnonymizedNodes();
    if (!settings.enabled) return;

    const replacement = settings.replacementText;
    collectTextNodes(document.body).forEach((node) => anonymizeTextNode(node, replacement));
    collectTextNodes(document.body, true).forEach((node) => anonymizeTextNode(node, replacement));
  }

  function handleMutations(mutations) {
    if (!currentSettings.enabled) return;
    const replacement = currentSettings.replacementText;

    mutations.forEach((mutation) => {
      if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
        if (shouldAnonymizeNode(mutation.target)) {
          anonymizeTextNode(mutation.target, replacement);
        }
      }
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && shouldAnonymizeNode(node)) {
            anonymizeTextNode(node, replacement);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            collectTextNodes(node).forEach((textNode) => anonymizeTextNode(textNode, replacement));
          }
        });
      }
    });
  }

  function createAnonymityLauncher() {
    const existing = document.querySelector('.blooket-anonymity-launcher');
    if (existing) return existing;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'blooket-anonymity-launcher';
    button.textContent = 'Anonymity';
    document.body.appendChild(button);
    return button;
  }

  function createAnonymityPanel() {
    const existing = document.querySelector('.blooket-anonymity-panel');
    if (existing) return existing;

    const panel = document.createElement('div');
    panel.className = 'blooket-anonymity-panel hidden';
    panel.innerHTML = `
      <div class="blooket-anonymity-header">
        <span>Anonymity Settings</span>
        <button type="button" class="blooket-anonymity-close">×</button>
      </div>
      <label class="blooket-anonymity-row">
        <input id="page-anonymity-toggle" type="checkbox" />
        <span>Hide your name</span>
      </label>
      <label class="blooket-anonymity-field">
        <span>Replacement name</span>
        <input id="page-replacement-input" type="text" maxlength="40" placeholder="Anonymous" />
      </label>
      <div class="blooket-anonymity-status" id="page-anonymity-status">Loading…</div>
    `;

    document.body.appendChild(panel);
    return panel;
  }

  function updateAnonymityStatus(enabled) {
    const status = document.getElementById('page-anonymity-status');
    if (status) {
      status.textContent = enabled ? 'Anonymity is on.' : 'Anonymity is off.';
    }
  }

  function saveAnonymitySettings() {
    const toggle = document.getElementById('page-anonymity-toggle');
    const input = document.getElementById('page-replacement-input');
    const nextSettings = {
      enabled: toggle?.checked || false,
      replacementText: input?.value?.trim() || DEFAULTS.replacementText
    };

    getStorage().set({ [STORAGE_KEY]: nextSettings }, () => {
      currentSettings = nextSettings;
      updateAnonymityStatus(nextSettings.enabled);
      applyAnonymity(currentSettings);
    });
  }

  function loadAnonymitySettings() {
    const toggle = document.getElementById('page-anonymity-toggle');
    const input = document.getElementById('page-replacement-input');

    getStorage().get([STORAGE_KEY], (result) => {
      currentSettings = normalizeSettings(result[STORAGE_KEY]);
      if (toggle) toggle.checked = currentSettings.enabled;
      if (input) input.value = currentSettings.replacementText;
      updateAnonymityStatus(currentSettings.enabled);
      applyAnonymity(currentSettings);
    });
  }

  function toggleAnonymityPanel(visible) {
    const panel = document.querySelector('.blooket-anonymity-panel');
    if (!panel) return;
    panel.classList.toggle('hidden', !visible);
  }

  function attachAnonymityListeners() {
    const panel = createAnonymityPanel();
    const launcher = createAnonymityLauncher();
    if (!panel || !launcher) return;

    launcher.addEventListener('click', () => {
      const hidden = panel.classList.contains('hidden');
      toggleAnonymityPanel(hidden);
    });

    panel.querySelector('.blooket-anonymity-close')?.addEventListener('click', () => {
      toggleAnonymityPanel(false);
    });

    const toggle = document.getElementById('page-anonymity-toggle');
    const input = document.getElementById('page-replacement-input');
    toggle?.addEventListener('change', saveAnonymitySettings);
    input?.addEventListener('input', saveAnonymitySettings);

    loadAnonymitySettings();
  }

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }

    attachAnonymityListeners();
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') return;
    if (!changes[STORAGE_KEY]) return;
    currentSettings = normalizeSettings(changes[STORAGE_KEY].newValue);
    updateAnonymityStatus(currentSettings.enabled);
    applyAnonymity(currentSettings);
  });

  if (document.readyState === 'loading') {
    window.addEventListener('load', init);
  } else {
    init();
  }
})();
