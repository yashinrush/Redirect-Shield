/**
 * Redirect Shield - Page context injection script
 * Runs in the main page world to override JavaScript redirect methods and hook event handling.
 */

(function() {
  // Config injected by content.js before script load
  const config = window.__REDIRECT_SHIELD_CONFIG__ || {
    enabled: true,
    protectionLevel: 'high',
    isWhitelisted: false,
    isBlacklisted: false,
    consoleLogging: true,
    debugMode: false
  };

  // If extension disabled or site is whitelisted, skip overrides
  if (!config.enabled || config.isWhitelisted) {
    if (config.consoleLogging) {
      console.log('[RedirectShield] Protection inactive for this domain.');
    }
    return;
  }

  if (config.consoleLogging) {
    console.log(`[RedirectShield] Actively shielding domain with protection level: ${config.protectionLevel}`);
  }

  // 1. Keep track of user interaction to separate manual actions from automatic redirect scripts
  let isUserInteracting = false;
  let interactionTimeout = null;

  function registerInteraction() {
    isUserInteracting = true;
    if (interactionTimeout) clearTimeout(interactionTimeout);
    interactionTimeout = setTimeout(() => {
      isUserInteracting = false;
    }, 800); // 800ms threshold window for scripts triggered by clicks
  }

  window.addEventListener('click', registerInteraction, { capture: true, passive: true });
  window.addEventListener('keydown', registerInteraction, { capture: true, passive: true });
  window.addEventListener('touchstart', registerInteraction, { capture: true, passive: true });
  window.addEventListener('mousedown', registerInteraction, { capture: true, passive: true });

  // 2. Helper to log blocked redirect events and dispatch postMessage to isolated content script
  function logBlocked(blockType, url) {
    const cleanUrl = url ? String(url).substring(0, 150) : 'unknown';
    
    // Developer Debug Mode logging (Feature 9: Stack Trace analysis)
    if (config.debugMode) {
      const stack = new Error().stack;
      console.groupCollapsed(`%c[RedirectShield Debug] Blocked ${blockType}: ${cleanUrl}`, 'color: #ef4444; font-weight: bold;');
      console.warn(`Blocked Redirection Target: ${url}`);
      console.info(`Global Status: Shield active, level: ${config.protectionLevel}`);
      console.log(`Script call stack trace:\n`, stack);
      console.groupEnd();
    } else if (config.consoleLogging) {
      console.warn(`%c[RedirectShield] Blocked ${blockType}: ${cleanUrl}`, 'color: #ef4444; font-weight: bold;');
    }

    window.postMessage({
      type: 'REDIRECT_SHIELD_BLOCKED_EVENT_MAIN',
      detail: {
        blockType,
        blockedUrl: cleanUrl,
        sourceDomain: window.location.hostname
      }
    }, '*');
  }

  // 3. Helper to determine if target URL leads to an external domain
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

      // Allow subdomains matching
      if (targetHost.endsWith('.' + currentHost) || currentHost.endsWith('.' + targetHost)) {
        return false;
      }

      return true;
    } catch (e) {
      return false; // Safely treat unparseable urls as local
    }
  }

  // 4. Decision engine to evaluate whether a URL redirection action should be blocked
  function shouldBlockRedirect(urlStr) {
    if (config.isBlacklisted) return true; // Extreme restriction on blacklisted sites

    const isExternal = isExternalUrl(urlStr);

    switch (config.protectionLevel) {
      case 'low':
        return isExternal && !isUserInteracting;

      case 'medium':
        if (isExternal && !isUserInteracting) return true;
        return false;

      case 'high':
        if (isExternal) {
          if (!isUserInteracting) return true;
        }
        return false;

      case 'extreme':
        if (isExternal) return true;
        return !isUserInteracting;

      default:
        return false;
    }
  }

  // 5. Override window.open
  const originalOpen = window.open;
  try {
    window.open = function(url, name, specs) {
      const targetUrl = url ? String(url) : 'about:blank';
      if (shouldBlockRedirect(targetUrl)) {
        logBlocked('popup', targetUrl);
        return null;
      }
      return originalOpen.apply(this, arguments);
    };
  } catch (e) {
    if (config.consoleLogging) {
      console.error('[RedirectShield] Failed to hook window.open', e);
    }
  }

  // 6. Hook Location prototype methods (assign & replace)
  try {
    const originalAssign = Location.prototype.assign;
    Location.prototype.assign = function(url) {
      const targetUrl = url ? String(url) : '';
      if (shouldBlockRedirect(targetUrl)) {
        logBlocked('redirect', targetUrl);
        return;
      }
      return originalAssign.call(this, url);
    };

    const originalReplace = Location.prototype.replace;
    Location.prototype.replace = function(url) {
      const targetUrl = url ? String(url) : '';
      if (shouldBlockRedirect(targetUrl)) {
        logBlocked('redirect', targetUrl);
        return;
      }
      return originalReplace.call(this, url);
    };

    const hrefDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    if (hrefDescriptor && hrefDescriptor.set) {
      const originalSetHref = hrefDescriptor.set;
      Object.defineProperty(Location.prototype, 'href', {
        set: function(url) {
          const targetUrl = url ? String(url) : '';
          if (shouldBlockRedirect(targetUrl)) {
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
  } catch (e) {
    if (config.consoleLogging) {
      console.error('[RedirectShield] Failed to hook Location prototype.', e);
    }
  }

  // 7. Hook History state methods
  try {
    const originalPushState = History.prototype.pushState;
    History.prototype.pushState = function(state, unused, url) {
      const targetUrl = url ? String(url) : '';
      if (targetUrl && shouldBlockRedirect(targetUrl)) {
        logBlocked('window', targetUrl);
        return;
      }
      return originalPushState.apply(this, arguments);
    };

    const originalReplaceState = History.prototype.replaceState;
    History.prototype.replaceState = function(state, unused, url) {
      const targetUrl = url ? String(url) : '';
      if (targetUrl && shouldBlockRedirect(targetUrl)) {
        logBlocked('window', targetUrl);
        return;
      }
      return originalReplaceState.apply(this, arguments);
    };
  } catch (e) {
    if (config.consoleLogging) {
      console.error('[RedirectShield] Failed to hook History prototype.', e);
    }
  }

  // 8. Dynamic document clicks intercept (capture phase)
  document.addEventListener('click', function(event) {
    let target = event.target;

    while (target && target !== document) {
      const tagName = target.tagName ? target.tagName.toUpperCase() : '';
      
      if (tagName === 'A' && target.target === '_blank') {
        const href = target.href || target.getAttribute('href');
        if (isExternalUrl(href)) {
          if (config.protectionLevel !== 'low') {
            target.target = '_self';
            if (config.consoleLogging) {
              console.log(`[RedirectShield] Converted target="_blank" to "_self" for external URL: ${href}`);
            }
          }
        }
      }

      if (tagName === 'A' || tagName === 'AREA' || target.hasAttribute('onclick')) {
        const href = target.href || target.getAttribute('href');
        
        if (href && shouldBlockRedirect(href)) {
          event.preventDefault();
          event.stopPropagation();
          logBlocked('redirect', href);
          return;
        }
      }
      
      target = target.parentNode;
    }
  }, true);

})();
