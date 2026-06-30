/**
 * Redirect Shield - Content Script
 * Runs at document_start. Instantly and synchronously injects main-world intercepts
 * to eliminate race conditions, queries configurations asynchronously, and runs DOM cleanups.
 */

(function() {
  const currentHost = window.location.hostname;
  let activeConfig = null;
  let throttleTimeout = null;

  // Inlined code from inject.js to guarantee synchronous execution before any page scripts load
  const mainWorldCode = `
(function() {
  let config = {
    enabled: true,
    protectionLevel: 'high',
    isWhitelisted: false,
    isBlacklisted: false,
    consoleLogging: true,
    debugMode: false
  };

  let lastClickTarget = null;
  let lastClickTime = 0;
  let lastClickTrusted = false;
  let isUserInteracting = false;
  let interactionTimeout = null;

  function registerInteraction(e) {
    isUserInteracting = true;
    lastClickTime = Date.now();
    lastClickTrusted = e.isTrusted !== false;
    lastClickTarget = e.target;

    if (interactionTimeout) clearTimeout(interactionTimeout);
    interactionTimeout = setTimeout(() => {
      isUserInteracting = false;
    }, 800);
  }

  window.addEventListener('click', registerInteraction, { capture: true, passive: true });
  window.addEventListener('keydown', registerInteraction, { capture: true, passive: true });
  window.addEventListener('touchstart', registerInteraction, { capture: true, passive: true });
  window.addEventListener('mousedown', registerInteraction, { capture: true, passive: true });

  function logBlocked(blockType, url) {
    const cleanUrl = url ? String(url).substring(0, 150) : 'unknown';
    
    if (config.debugMode) {
      const stack = new Error().stack;
      console.groupCollapsed('%c[RedirectShield Debug] Blocked ' + blockType + ': ' + cleanUrl, 'color: #ef4444; font-weight: bold;');
      console.warn('Blocked Redirection Target: ' + url);
      console.info('Active Level: ' + config.protectionLevel);
      console.log('Script call stack trace:\\n', stack);
      console.groupEnd();
    } else if (config.consoleLogging) {
      console.warn('%c[RedirectShield] Blocked ' + blockType + ': ' + cleanUrl, 'color: #ef4444; font-weight: bold;');
    }

    window.postMessage({
      type: 'REDIRECT_SHIELD_BLOCKED_EVENT_MAIN',
      detail: {
        blockType: blockType,
        blockedUrl: cleanUrl,
        sourceDomain: window.location.hostname
      }
    }, '*');
  }

  function isExternalUrl(urlStr) {
    try {
      if (!urlStr) return false;
      const urlStrTrim = String(urlStr).trim();
      if (
        urlStrTrim.startsWith('/') ||
        urlStrTrim.startsWith('.') ||
        urlStrTrim.startsWith('#') ||
        urlStrTrim.toLowerCase().startsWith('javascript:') ||
        urlStrTrim.toLowerCase().startsWith('mailto:') ||
        urlStrTrim.toLowerCase().startsWith('tel:')
      ) {
        return false;
      }
      const url = new URL(urlStrTrim, window.location.href);
      const currentHost = window.location.hostname;
      const targetHost = url.hostname;

      if (currentHost === targetHost) return false;

      if (targetHost.endsWith('.' + currentHost) || currentHost.endsWith('.' + targetHost)) {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  function getDomainName(urlStr) {
    try {
      const url = new URL(urlStr, window.location.href);
      return url.hostname;
    } catch (e) {
      return '';
    }
  }

  function styleIsButton(el) {
    if (!el || !el.getAttribute) return false;
    const role = el.getAttribute('role');
    if (role === 'button' || role === 'link') return true;
    const klass = el.getAttribute('class');
    if (klass && (klass.includes('btn') || klass.includes('button') || klass.includes('play'))) return true;
    return false;
  }

  function shouldBlockRedirect(urlStr, actionType) {
    if (!config.enabled || config.isWhitelisted) return false;
    if (config.isBlacklisted) return true;

    const isExternal = isExternalUrl(urlStr);
    if (!isExternal) return false;

    const isClickRecent = (Date.now() - lastClickTime) < 1000;
    const isUserAction = isUserInteracting && isClickRecent && lastClickTrusted;

    let isLegitTrigger = false;
    if (isUserAction && lastClickTarget) {
      let node = lastClickTarget;
      while (node && node !== document) {
        const tag = node.tagName ? node.tagName.toUpperCase() : '';
        if (tag === 'A' || tag === 'BUTTON' || node.hasAttribute('onclick') || styleIsButton(node)) {
          isLegitTrigger = true;
          break;
        }
        node = node.parentNode || node.host;
      }
    }

    const oauthProviders = [
      'accounts.google.com', 'github.com', 'facebook.com', 'twitter.com',
      'linkedin.com', 'appleid.apple.com', 'okta.com', 'auth0.com'
    ];
    const targetDomain = getDomainName(urlStr);
    const isOAuth = oauthProviders.some(function(d) {
      return targetDomain === d || targetDomain.endsWith('.' + d);
    });

    switch (config.protectionLevel) {
      case 'low':
        if (actionType === 'popup') {
          return !isUserAction;
        }
        return false;

      case 'medium':
        return !isUserAction;

      case 'high':
        if (!isUserAction) return true;
        if (isOAuth) return false;
        return !isLegitTrigger;

      case 'extreme':
        if (isOAuth && isUserAction && isLegitTrigger) return false;
        return true;

      default:
        return false;
    }
  }

  const originalOpen = window.open;
  const originalAssign = Location.prototype.assign;
  const originalReplace = Location.prototype.replace;
  const originalPushState = History.prototype.pushState;
  const originalReplaceState = History.prototype.replaceState;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  const originalAreaClick = HTMLAreaElement.prototype.click;
  const originalSubmit = HTMLFormElement.prototype.submit;
  
  let originalSetHref = null;
  const hrefDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
  if (hrefDescriptor && hrefDescriptor.set) {
    originalSetHref = hrefDescriptor.set;
  }

  function onNavigate(event) {
    const targetUrl = event.destination.url;
    if (shouldBlockRedirect(targetUrl, 'redirect')) {
      event.preventDefault();
      logBlocked('navigation', targetUrl);
    }
  }

  function applyOverrides() {
    try {
      window.open = function(url, name, specs) {
        const targetUrl = url ? String(url) : 'about:blank';
        if (shouldBlockRedirect(targetUrl, 'popup')) {
          logBlocked('popup', targetUrl);
          return null;
        }
        return originalOpen.apply(this, arguments);
      };

      Location.prototype.assign = function(url) {
        const targetUrl = url ? String(url) : '';
        if (shouldBlockRedirect(targetUrl, 'redirect')) {
          logBlocked('redirect', targetUrl);
          return;
        }
        return originalAssign.call(this, url);
      };

      Location.prototype.replace = function(url) {
        const targetUrl = url ? String(url) : '';
        if (shouldBlockRedirect(targetUrl, 'redirect')) {
          logBlocked('redirect', targetUrl);
          return;
        }
        return originalReplace.call(this, url);
      };

      if (originalSetHref) {
        Object.defineProperty(Location.prototype, 'href', {
          set: function(url) {
            const targetUrl = url ? String(url) : '';
            if (shouldBlockRedirect(targetUrl, 'redirect')) {
              logBlocked('redirect', targetUrl);
              return;
            }
            originalSetHref.call(this, url);
          },
          get: hrefDescriptor.get,
          configurable: true,
          enumerable: true
        });
      }

      History.prototype.pushState = function(state, unused, url) {
        const targetUrl = url ? String(url) : '';
        if (targetUrl && shouldBlockRedirect(targetUrl, 'window')) {
          logBlocked('window', targetUrl);
          return;
        }
        return originalPushState.apply(this, arguments);
      };

      History.prototype.replaceState = function(state, unused, url) {
        const targetUrl = url ? String(url) : '';
        if (targetUrl && shouldBlockRedirect(targetUrl, 'window')) {
          logBlocked('window', targetUrl);
          return;
        }
        return originalReplaceState.apply(this, arguments);
      };

      HTMLAnchorElement.prototype.click = function() {
        const href = this.href || this.getAttribute('href');
        if (href && shouldBlockRedirect(href, 'redirect')) {
          logBlocked('anchor click bypass', href);
          return;
        }
        return originalAnchorClick.apply(this, arguments);
      };

      HTMLAreaElement.prototype.click = function() {
        const href = this.href || this.getAttribute('href');
        if (href && shouldBlockRedirect(href, 'redirect')) {
          logBlocked('area click bypass', href);
          return;
        }
        return originalAreaClick.apply(this, arguments);
      };

      HTMLFormElement.prototype.submit = function() {
        const action = this.action || this.getAttribute('action');
        if (action && shouldBlockRedirect(action, 'redirect')) {
          logBlocked('form submit', action);
          return;
        }
        return originalSubmit.apply(this, arguments);
      };

      if (typeof navigation !== 'undefined') {
        navigation.addEventListener('navigate', onNavigate);
      }
    } catch (e) {
      console.error('[RedirectShield] Overrides installation failed.', e);
    }
  }

  function restoreOriginals() {
    window.open = originalOpen;
    Location.prototype.assign = originalAssign;
    Location.prototype.replace = originalReplace;
    History.prototype.pushState = originalPushState;
    History.prototype.replaceState = originalReplaceState;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    HTMLAreaElement.prototype.click = originalAreaClick;
    HTMLFormElement.prototype.submit = originalSubmit;
    
    if (originalSetHref) {
      Object.defineProperty(Location.prototype, 'href', {
        set: originalSetHref,
        configurable: true,
        enumerable: true
      });
    }

    if (typeof navigation !== 'undefined') {
      navigation.removeEventListener('navigate', onNavigate);
    }
  }

  applyOverrides();

  window.addEventListener('message', function(e) {
    if (e.source !== window) return;
    if (e.data && e.data.type === 'REDIRECT_SHIELD_CONFIG_UPDATE') {
      config = e.data.config;
      if (!config.enabled || config.isWhitelisted) {
        restoreOriginals();
      }
    }
  });

  document.addEventListener('click', function(event) {
    if (!config.enabled || config.isWhitelisted) return;
    
    let target = event.target;
    while (target && target !== document) {
      const tagName = target.tagName ? target.tagName.toUpperCase() : '';
      if (tagName === 'A' && target.target === '_blank') {
        const href = target.href || target.getAttribute('href');
        if (isExternalUrl(href) && config.protectionLevel !== 'low') {
          target.target = '_self';
          if (config.consoleLogging) {
            console.log('[RedirectShield] Converted target="_blank" to "_self" for external URL: ' + href);
          }
        }
      }

      if (tagName === 'A' || tagName === 'AREA' || target.hasAttribute('onclick')) {
        const href = target.href || target.getAttribute('href');
        if (href && shouldBlockRedirect(href, 'redirect')) {
          event.preventDefault();
          event.stopPropagation();
          logBlocked('redirect', href);
          return;
        }
      }
      target = target.parentNode || target.host;
    }
  }, true);

})();
`;

  // 1. Instantly inject the blocker in the main world (eliminates async load race conditions)
  try {
    const script = document.createElement('script');
    script.textContent = mainWorldCode;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (err) {
    console.error('[RedirectShield] Synchronous content injection failed.', err);
  }

  // 2. Fetch configurations asynchronously from background service worker
  chrome.runtime.sendMessage({
    type: 'REDIRECT_SHIELD_GET_TAB_CONFIG',
    url: window.location.href
  }, (response) => {
    if (!response) return;

    activeConfig = response;

    // Send updated configurations to the main world
    window.postMessage({
      type: 'REDIRECT_SHIELD_CONFIG_UPDATE',
      config: response
    }, '*');

    // Run cleanups if enabled
    if (activeConfig.enabled && activeConfig.autoRemoveOverlays) {
      setupMutationObserver();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', performDOMCleanup);
      } else {
        performDOMCleanup();
      }
    }
  });

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

      chrome.runtime.sendMessage({
        type: 'REDIRECT_SHIELD_BLOCKED_EVENT',
        detail: details
      });

      if (activeConfig && activeConfig.showToasts) {
        showBlockedToast(details.blockedUrl, details.blockType);
      }
    }
  });

  // Listen for state change events from background page
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'REDIRECT_SHIELD_STATE_CHANGED') {
      window.location.reload();
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
