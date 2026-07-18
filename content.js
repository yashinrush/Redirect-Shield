/**
 * Redirect Shield AI - Content Script Coordinator
 * Runs at document_start in tab isolated context. Injects main-world scripts,
 * queries storage configs, runs MutationObservers, and delegates block trackers.
 */
(function() {
  const logger = RedirectShieldLogger;
  const helpers = RedirectShieldHelpers;
  const rules = RedirectShieldRules;
  const detector = RedirectShieldDetector;
  const overlayShield = RedirectShieldOverlay;
  const toast = RedirectShieldToast;

  let activeConfig = null;
  let mutationObserver = null;

  // 1. inject.js is now natively injected in the MAIN world by Chrome via manifest.json

  // 2. Fetch page-specific configuration parameters from background worker
  chrome.runtime.sendMessage({
    type: 'REDIRECT_SHIELD_GET_TAB_CONFIG',
    url: window.location.href
  }, (response) => {
    if (!response) return;

    activeConfig = response;
    logger.setLevel(activeConfig.consoleLogging ? 'DEBUG' : 'INFO');

    // Synchronize current configuration rules down to the main-world inject context
    window.postMessage({
      type: 'REDIRECT_SHIELD_CONFIG_UPDATE',
      config: activeConfig
    }, '*');

    // 3. Initiate defense systems based on active configuration
    if (activeConfig.enabled && !activeConfig.isWhitelisted) {
      setupMutationObserver();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runDOMDefenseChecks);
      } else {
        runDOMDefenseChecks();
      }
    }
  });

  /**
   * Scans and wipes click hijack overlays, ad frames, and flags fake downloads
   */
  function runDOMDefenseChecks() {
    if (!activeConfig || !activeConfig.enabled || activeConfig.isWhitelisted) return;

    // Invisible viewport sweeps
    if (activeConfig.autoRemoveOverlays) {
      overlayShield.removeInvisibleOverlays(activeConfig);
      // Basic selectors sweep for standard popup containers
      if (activeConfig.protectionLevel !== 'basic') {
        overlayShield.removeCommonAdElements();
      }
    }

    // Flag deceptive buttons if enabled
    if (activeConfig.detectFakeDownloads) {
      scanAndFlagDeceptiveElements();
    }
  }

  /**
   * Scans target clickable tags and flags fake play/download indicators
   */
  function scanAndFlagDeceptiveElements() {
    const clickables = document.querySelectorAll('a, button, div, span, img');
    clickables.forEach(el => {
      const result = detector.detectDeceptiveElement(el);
      if (result) {
        detector.highlightDeceptiveElement(el, result.reason);
      }
    });
  }

  /**
   * Installs MutationObserver using throttled triggers to check dynamic DOM additions
   */
  function setupMutationObserver() {
    if (mutationObserver) return;

    // Throttle checks to once every 400ms to preserve UI scrolling performance
    const throttledDefense = helpers.throttle(() => {
      runDOMDefenseChecks();
    }, 400);

    mutationObserver = new MutationObserver((mutations) => {
      let isNodeAdded = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          isNodeAdded = true;
          break;
        }
      }
      if (isNodeAdded) {
        throttledDefense();
      }
    });

    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // 4. Listen to postMessages dispatched from page context (inject.js overrides)
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;

    const data = event.data;

    if (data.type === 'REDIRECT_SHIELD_BLOCKED_EVENT_MAIN') {
      // Forward blocked window/redirect counts to background stats
      chrome.runtime.sendMessage({
        type: 'REDIRECT_SHIELD_BLOCKED_EVENT',
        detail: data.detail
      });

      // Display warning toast alert
      if (activeConfig && activeConfig.showToasts) {
        toast.show(data.detail.blockedUrl, data.detail.blockType);
      }
    } else if (data.type === 'REDIRECT_SHIELD_OVERLAY_BLOCKED') {
      // Log overlay removal statistics
      chrome.runtime.sendMessage({
        type: 'REDIRECT_SHIELD_BLOCKED_EVENT',
        detail: {
          blockType: 'overlay',
          blockedUrl: data.detail.url
        }
      });

      if (activeConfig && activeConfig.showToasts) {
        toast.show(data.detail.url, 'overlay');
      }
    } else if (data.type === 'REDIRECT_SHIELD_DECEPTIVE_DISMISSED') {
      // Log deceptive block statistics
      chrome.runtime.sendMessage({
        type: 'REDIRECT_SHIELD_BLOCKED_EVENT',
        detail: {
          blockType: 'deceptive',
          blockedUrl: data.detail.url
        }
      });

      if (activeConfig && activeConfig.showToasts) {
        toast.show('Deceptive Element warning acknowledged', 'deceptive');
      }
    }
  });

  // Listen to configuration reload signals and manual zap commands
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'REDIRECT_SHIELD_STATE_CHANGED') {
      window.location.reload();
    } else if (message && message.type === 'REDIRECT_SHIELD_MANUAL_ZAP') {
      if (activeConfig && activeConfig.enabled && !activeConfig.isWhitelisted) {
        const didRemoveOverlays = overlayShield.removeInvisibleOverlays(activeConfig);
        // Force scan deceptive buttons too
        if (activeConfig.detectFakeDownloads) {
          scanAndFlagDeceptiveElements();
        }
        sendResponse({ success: true, removed: didRemoveOverlays });
      } else {
        sendResponse({ success: false, reason: 'Shield is disabled or site is whitelisted' });
      }
    }
    return true;
  });
})();
