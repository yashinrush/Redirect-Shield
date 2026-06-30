/**
 * Redirect Shield - Page context injection script
 * Runs in the main page world to override JavaScript redirect methods and hook event handling.
 */

(function() {
  // Initial default config (highly secure default, updated dynamically by content.js)
  let config = {
    enabled: true,
    protectionLevel: 'high',
    isWhitelisted: false,
    isBlacklisted: false,
    consoleLogging: true,
    debugMode: false
  };

  // 1. Keep track of user interaction clicks and their targets
  let lastClickTarget = null;
  let lastClickTime = 0;
  let lastClickTrusted = false;
  let isUserInteracting = false;
  let interactionTimeout = null;

  function registerInteraction(e) {
    isUserInteracting = true;
    lastClickTime = Date.now();
    lastClickTrusted = e.isTrusted !== false; // Check for programmatic click event dispatching
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

  // 2. Helper to log blocked redirect events and dispatch postMessage to content script
  function logBlocked(blockType, url) {
    const cleanUrl = url ? String(url).substring(0, 150) : 'unknown';
    
    if (config.debugMode) {
      const stack = new Error().stack;
      console.groupCollapsed(`%c[RedirectShield Debug] Blocked ${blockType}: ${cleanUrl}`, 'color: #ef4444; font-weight: bold;');
      console.warn(`Blocked Redirection Target: ${url}`);
      console.info(`Active Level: ${config.protectionLevel}`);
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

      // Subdomains match check
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

  // Check custom styling indicative of button classes
  function styleIsButton(el) {
    if (!el || !el.getAttribute) return false;
    const role = el.getAttribute('role');
    if (role === 'button' || role === 'link') return true;
    const klass = el.getAttribute('class');
    if (klass && (klass.includes('btn') || klass.includes('button') || klass.includes('play'))) return true;
    return false;
  }

  // 4. Advanced Redirect Classifier Heuristics
  function shouldBlockRedirect(urlStr, actionType) {
    if (!config.enabled || config.isWhitelisted) return false;
    if (config.isBlacklisted) return true;

    const isExternal = isExternalUrl(urlStr);
    if (!isExternal) return false; // Always allow local redirections

    const isClickRecent = (Date.now() - lastClickTime) < 1000;
    const isUserAction = isUserInteracting && isClickRecent && lastClickTrusted;

    // Inspect if user clicked a legitimate trigger element
    let isLegitTrigger = false;
    if (isUserAction && lastClickTarget) {
      let node = lastClickTarget;
      while (node && node !== document) {
        const tag = node.tagName ? node.tagName.toUpperCase() : '';
        if (tag === 'A' || tag === 'BUTTON' || node.hasAttribute('onclick') || styleIsButton(node)) {
          isLegitTrigger = true;
          break;
        }
        node = node.parentNode;
      }
    }

    // Known sharing/identity domains
    const oauthProviders = [
      'accounts.google.com', 'github.com', 'facebook.com', 'twitter.com',
      'linkedin.com', 'appleid.apple.com', 'okta.com', 'auth0.com'
    ];
    const targetDomain = getDomainName(urlStr);
    const isOAuth = oauthProviders.some(d => targetDomain === d || targetDomain.endsWith('.' + d));

    switch (config.protectionLevel) {
      case 'low':
        if (actionType === 'popup') {
          return !isUserAction;
        }
        return false;

      case 'medium':
        // Block automatic pops/redirects, allow manual ones
        return !isUserAction;

      case 'high':
        // Block automatic actions. For manual actions, block if clicked element isn't legitimate (click hijacking)
        if (!isUserAction) return true;
        if (isOAuth) return false; // Always permit logins
        return !isLegitTrigger;

      case 'extreme':
        // Strict shield. Blocks all external navigations.
        if (isOAuth && isUserAction && isLegitTrigger) return false;
        return true;

      default:
        return false;
    }
  }

  // 5. Override APIs and save original references
  const originalOpen = window.open;
  const originalAssign = Location.prototype.assign;
  const originalReplace = Location.prototype.replace;
  const originalPushState = History.prototype.pushState;
  const originalReplaceState = History.prototype.replaceState;
  
  let originalSetHref = null;
  const hrefDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
  if (hrefDescriptor && hrefDescriptor.set) {
    originalSetHref = hrefDescriptor.set;
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
    if (originalSetHref) {
      Object.defineProperty(Location.prototype, 'href', {
        set: originalSetHref,
        configurable: true,
        enumerable: true
      });
    }
  }

  // Apply instantly at document_start
  applyOverrides();

  // Listen for config sync updates from content script
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data && e.data.type === 'REDIRECT_SHIELD_CONFIG_UPDATE') {
      config = e.data.config;
      
      // If whitelisted or disabled, restore original hooks to remove extensions overhead
      if (!config.enabled || config.isWhitelisted) {
        restoreOriginals();
      }
    }
  });

  // Capture target=_blank conversion logic
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
            console.log(`[RedirectShield] Converted target="_blank" to "_self" for external URL: ${href}`);
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
      target = target.parentNode;
    }
  }, true);

})();
