(() => {
  if (window.__blooketTradeVisualizerBootstrapped) return;
  window.__blooketTradeVisualizerBootstrapped = true;

  const init = () => {
    if (window.__blooketTradeVisualizerInit) {
      window.__blooketTradeVisualizerInit();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
