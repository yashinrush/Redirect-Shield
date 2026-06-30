/**
 * Redirect Shield - Content Script
 * Runs at document_start. Requests unified tab configurations from background,
 * executes main-world script injection, runs cleanups, and generates toast notifications.
 */

(function() {
  const currentHost = window.location.hostname;
  let activeConfig = null;
  let throttleTimeout = null;

  // 1. Fetch tab-specific computed configurations from background worker
  chrome.runtime.sendMessage({
    type: 'REDIRECT_SHIELD_GET_TAB_CONFIG',
    url: window.location.href
  }, (response) => {
    if (!response) {
      console.warn('[RedirectShield] Failed to retrieve settings config from background worker.');
      return;
    }

    activeConfig = response;

    // If disabled, bypassed, or whitelisted, stop executions
    if (!activeConfig.enabled) {
      if (activeConfig.consoleLogging && activeConfig.isWhitelisted) {
        console.log(`[RedirectShield] Domain whitelisted: ${currentHost}`);
      } else if (activeConfig.consoleLogging && activeConfig.isTabPaused) {
        console.log(`[RedirectShield] Protection paused for this tab session.`);
      }
      return;
    }

    // 2. Inject main-world configuration variables and action scripts
    injectMainScript();

    // 3. Setup dynamic MutationObserver for overlays and containers removal
    if (activeConfig.autoRemoveOverlays) {
      setupMutationObserver();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', performDOMCleanup);
      } else {
        performDOMCleanup();
      }
    }
  });

  // Inject configurations and main-world scripts
  function injectMainScript() {
    try {
      const configObj = {
        enabled: activeConfig.enabled,
        protectionLevel: activeConfig.protectionLevel,
        isWhitelisted: activeConfig.isWhitelisted,
        isBlacklisted: activeConfig.isBlacklisted,
        consoleLogging: activeConfig.consoleLogging,
        debugMode: activeConfig.debugMode
      };

      // Injects config properties onto window object in target world
      const configScript = document.createElement('script');
      configScript.textContent = `window.__REDIRECT_SHIELD_CONFIG__ = ${JSON.stringify(configObj)};`;
      (document.head || document.documentElement).appendChild(configScript);
      configScript.remove();

      // Injects main-world scripts
      const injectScript = document.createElement('script');
      injectScript.src = chrome.runtime.getURL('inject.js');
      injectScript.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(injectScript);
    } catch (e) {
      console.error('[RedirectShield] Main-world injection script failed.', e);
    }
  }

  // Setup efficient MutationObserver using throttling
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let isNodeAdded = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          isNodeAdded = true;
          break;
        }
      }
      if (isNodeAdded) {
        throttleCleanup();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Throttles DOM cleanup invocation to optimize browser performance
  function throttleCleanup() {
    if (throttleTimeout) return;
    throttleTimeout = setTimeout(() => {
      performDOMCleanup();
      throttleTimeout = null;
    }, 400);
  }

  // Identifies and cleans click hijacking overlays and dynamic ads
  function performDOMCleanup() {
    if (!activeConfig || !activeConfig.enabled) return;

    const level = activeConfig.protectionLevel;
    
    if (level === 'high' || level === 'extreme') {
      removeInvisibleOverlays();
    }
    
    if (level !== 'low') {
      removeCommonAdElements();
    }
  }

  // Identifies fixed/absolute transparent overlays spanning the browser window
  function removeInvisibleOverlays() {
    const elements = document.querySelectorAll('div, section, span, a');
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    elements.forEach(element => {
      if (element === document.body || element === document.documentElement || element.id === 'redirect-shield-toast-container') {
        return;
      }

      try {
        const style = window.getComputedStyle(element);
        const position = style.position;
        if (position !== 'fixed' && position !== 'absolute') return;

        const width = element.offsetWidth;
        const height = element.offsetHeight;
        
        const isSpanning = (width >= vw * 0.85 && height >= vh * 0.85) ||
                            style.width === '100vw' || style.height === '100vh' ||
                            (style.width === '100%' && style.height === '100%');

        if (!isSpanning) return;

        const zIndex = parseInt(style.zIndex, 10);
        if (isNaN(zIndex) || zIndex < 90) return;

        const bg = style.backgroundColor;
        const opacity = parseFloat(style.opacity);
        
        const isTransparent = bg === 'transparent' || 
                              bg.includes('rgba(') && (bg.endsWith(', 0)') || bg.split(',')[3].trim().startsWith('0)')) ||
                              opacity < 0.12;

        const hasPointerEvents = style.pointerEvents !== 'none';

        if (isTransparent && hasPointerEvents) {
          const textLength = element.textContent.trim().length;
          const childInputsCount = element.querySelectorAll('input, button, select, textarea').length;
          
          if (textLength < 60 && childInputsCount === 0) {
            element.remove();
            
            if (activeConfig.consoleLogging) {
              console.log(`[RedirectShield] Removed invisible click-hijack overlay (z-index: ${zIndex})`);
            }

            chrome.runtime.sendMessage({
              type: 'REDIRECT_SHIELD_BLOCKED_EVENT',
              detail: {
                blockType: 'overlay',
                blockedUrl: 'Overlay removed',
                sourceDomain: currentHost
              }
            });
          }
        }
      } catch (err) {
        // Fail silently
      }
    });
  }

  // Remove common advertising containers and banners
  function removeCommonAdElements() {
    const adSelectors = [
      'iframe[src*="popads"]',
      'iframe[src*="propellerads"]',
      'iframe[src*="onclickads"]',
      'a[href*="adsystem"]',
      'a[href*="doubleclick"]',
      'div[class*="popup-ad"]',
      'div[id*="popup-ad"]',
      'div[class*="fullscreen-ad"]',
      'div[id*="fullscreen-ad"]',
      'div[class*="ad-banner"]',
      'div[id*="ad-banner"]',
      'div[class*="modal-ad"]'
    ];

    try {
      const elements = document.querySelectorAll(adSelectors.join(','));
      elements.forEach(element => {
        if (element.id === 'redirect-shield-toast-container' || element.closest('#redirect-shield-toast-container')) {
          return;
        }

        element.remove();
        
        if (activeConfig.consoleLogging) {
          console.log('[RedirectShield] Removed dynamic ad container element.');
        }

        chrome.runtime.sendMessage({
          type: 'REDIRECT_SHIELD_BLOCKED_EVENT',
          detail: {
            blockType: 'overlay',
            blockedUrl: 'Ad Container removed',
            sourceDomain: currentHost
          }
        });
      });
    } catch (e) {
      // Fail silently
    }
  }

  // 3. Listen to messages from inject.js inside page context
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data && event.data.type === 'REDIRECT_SHIELD_BLOCKED_EVENT_MAIN') {
      const details = event.data.detail;

      // Send to background service worker for stats tracking
      chrome.runtime.sendMessage({
        type: 'REDIRECT_SHIELD_BLOCKED_EVENT',
        detail: details
      });

      // Show toast block alert
      if (activeConfig && activeConfig.showToasts) {
        showBlockedToast(details.blockedUrl, details.blockType);
      }
    }
  });

  // Listen for state change events from background page
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'REDIRECT_SHIELD_STATE_CHANGED') {
      window.location.reload(); // Reload page to update configs
    }
  });

  // Renders shadow-DOM toast notifications
  let toastContainer = null;
  function showBlockedToast(url, type) {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'redirect-shield-toast-container';
      Object.assign(toastContainer.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: '999999999',
        pointerEvents: 'none'
      });
      document.body.appendChild(toastContainer);
    }

    let shadow = toastContainer.shadowRoot;
    if (!shadow) {
      shadow = toastContainer.attachShadow({ mode: 'closed' });
      
      const style = document.createElement('style');
      style.textContent = `
        .toast {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(12px) saturate(160%);
          -webkit-backdrop-filter: blur(12px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #ffffff;
          padding: 12px 18px;
          border-radius: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          pointer-events: auto;
          margin-top: 10px;
          opacity: 0;
          transform: translateY(24px) scale(0.95);
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
          min-width: 260px;
          max-width: 380px;
        }
        .toast.show {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          background: rgba(16, 185, 129, 0.15);
          border-radius: 50%;
          color: #10b981;
          flex-shrink: 0;
          box-shadow: inset 0 0 4px rgba(16, 185, 129, 0.2);
        }
        .content {
          flex-grow: 1;
          overflow: hidden;
        }
        .title {
          font-weight: 600;
          margin-bottom: 2px;
        }
        .url {
          color: #94a3b8;
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `;
      shadow.appendChild(style);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const displayType = type.charAt(0).toUpperCase() + type.slice(1);
    
    toast.innerHTML = `
      <div class="icon-wrapper">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <div class="content">
        <div class="title">${displayType} Blocked</div>
        <div class="url" title="${url}">${url}</div>
      </div>
    `;

    shadow.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 15);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 350);
    }, 3000);
  }

})();
