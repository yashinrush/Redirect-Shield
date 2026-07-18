/**
 * Redirect Shield AI - Main Page Intercepts
 * Injected directly into the website's MAIN world to override JS API redirection hooks.
 * Stops click hijacking attempts and programmatic navigations before they open external tabs.
 */
(function() {
  let config = {
    enabled: true,
    protectionLevel: 'balanced',
    isWhitelisted: false,
    isBlacklisted: false,
    consoleLogging: true
  };

  // Interaction tracking variables
  let lastClickTime = 0;
  let lastClickTarget = null;
  let lastClickTrusted = false;
  let isUserInteracting = false;
  let interactionTimeout = null;

  /**
   * Registers physical user interaction signals to distinguish them from programmatic ad-hooks
   * @param {Event} e - DOM event
   */
  function registerUserInteraction(e) {
    isUserInteracting = true;
    lastClickTime = Date.now();
    lastClickTrusted = e.isTrusted !== false;
    lastClickTarget = e.target;

    // Reset interaction window after 800ms
    if (interactionTimeout) clearTimeout(interactionTimeout);
    interactionTimeout = setTimeout(() => {
      isUserInteracting = false;
    }, 800);
  }

  // Intercept capture phase inputs to verify origin credentials
  window.addEventListener('click', registerUserInteraction, { capture: true, passive: true });
  window.addEventListener('keydown', registerUserInteraction, { capture: true, passive: true });
  window.addEventListener('touchstart', registerUserInteraction, { capture: true, passive: true });
  window.addEventListener('mousedown', registerUserInteraction, { capture: true, passive: true });

  /**
   * Helper to parse host domain from URL string
   */
  function getUrlDomain(urlStr) {
    try {
      const url = new URL(urlStr, window.location.href);
      return url.hostname;
    } catch (e) {
      return '';
    }
  }

  /**
   * Checks if target is external
   */
  function isExternalUrl(targetUrlStr, sourceHost) {
    if (!targetUrlStr) return false;
    const trimUrl = targetUrlStr.trim();
    if (
      trimUrl.startsWith('/') ||
      trimUrl.startsWith('.') ||
      trimUrl.startsWith('#') ||
      trimUrl.toLowerCase().startsWith('javascript:') ||
      trimUrl.toLowerCase().startsWith('mailto:') ||
      trimUrl.toLowerCase().startsWith('tel:')
    ) {
      return false;
    }
    try {
      const targetUrl = new URL(trimUrl, window.location.href);
      const targetHost = targetUrl.hostname.toLowerCase();
      const sourceHostLower = sourceHost.toLowerCase();
      if (targetHost === sourceHostLower) return false;

      // Subdomains check
      const getRoot = (host) => {
        const parts = host.split('.');
        return parts.length > 2 ? parts.slice(-2).join('.') : host;
      };
      return getRoot(targetHost) !== getRoot(sourceHostLower);
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if click targets mimic button class structures
   */
  function isButtonLikeElement(el) {
    if (!el || !el.getAttribute) return false;
    const role = el.getAttribute('role');
    if (role === 'button' || role === 'link') return true;
    const className = el.getAttribute('class');
    if (className && (className.includes('btn') || className.includes('button') || className.includes('play'))) return true;
    return false;
  }

  /**
   * Internal heuristics to classify if a navigation is an unauthorized redirect
   */
  function shouldBlockNavigation(targetUrl, contextType) {
    if (!config.enabled || config.isWhitelisted) return false;
    if (config.isBlacklisted) return true;

    const currentHost = window.location.hostname;
    const isExternal = isExternalUrl(targetUrl, currentHost);
    if (!isExternal) return false;

    // Check click validation timers
    const isClickRecent = (Date.now() - lastClickTime) < 1000;
    const isUserAction = isUserInteracting && isClickRecent && lastClickTrusted;

    // Verify trigger node path
    let isLegitimateTrigger = false;
    if (isUserAction && lastClickTarget) {
      let node = lastClickTarget;
      while (node && node !== document) {
        const tag = node.tagName ? node.tagName.toUpperCase() : '';
        if (tag === 'A' || tag === 'BUTTON' || node.hasAttribute('onclick') || isButtonLikeElement(node)) {
          isLegitimateTrigger = true;
          break;
        }
        node = node.parentNode || node.host;
      }
    }

    // SSO login domains
    const ssoDomains = ['accounts.google.com', 'github.com', 'facebook.com', 'twitter.com', 'x.com', 'discord.com'];
    const targetHost = getUrlDomain(targetUrl);
    const isSSO = ssoDomains.some(d => targetHost === d || targetHost.endsWith('.' + d));

    switch (config.protectionLevel) {
      case 'basic':
        if (contextType === 'popup') return !isUserAction;
        return false;

      case 'balanced':
        return !isUserAction;

      case 'advanced':
        if (!isUserAction) return true;
        if (isSSO) return false;
        // Block programmatic redirects inside legitimate click scopes
        if (contextType === 'redirect') return true;
        return !isLegitimateTrigger;

      case 'maximum':
        if (isSSO && isUserAction && isLegitimateTrigger) return false;
        return true;

      default:
        return false;
    }
  }

  /**
   * Helper to dispatch statistics logging block actions back to content script
   */
  function dispatchBlockEvent(blockType, url) {
    const cleanUrl = url ? String(url).substring(0, 150) : 'unknown';

    if (config.consoleLogging) {
      console.warn(`%c[NexShield] Intercepted [${blockType}] attempt leads to: ${cleanUrl}`, 'color: #ef4444; font-weight: bold;');
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

  // Backup original references to avoid prototype pollution checks
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

  function applyOverrides() {
    // Intercept window.open
    window.open = function(url, name, specs) {
      const target = url ? String(url) : 'about:blank';
      if (shouldBlockNavigation(target, 'popup')) {
        dispatchBlockEvent('popup', target);
        return null;
      }
      return originalOpen.apply(this, arguments);
    };

    // Intercept Location assign
    Location.prototype.assign = function(url) {
      const target = url ? String(url) : '';
      if (shouldBlockNavigation(target, 'redirect')) {
        dispatchBlockEvent('redirect', target);
        return;
      }
      return originalAssign.call(this, url);
    };

    // Intercept Location replace
    Location.prototype.replace = function(url) {
      const target = url ? String(url) : '';
      if (shouldBlockNavigation(target, 'redirect')) {
        dispatchBlockEvent('redirect', target);
        return;
      }
      return originalReplace.call(this, url);
    };

    // Intercept location.href setter
    if (originalSetHref) {
      Object.defineProperty(Location.prototype, 'href', {
        set: function(url) {
          const target = url ? String(url) : '';
          if (shouldBlockNavigation(target, 'redirect')) {
            dispatchBlockEvent('redirect', target);
            return;
          }
          originalSetHref.call(this, url);
        },
        get: hrefDescriptor.get,
        configurable: true,
        enumerable: true
      });
    }

    // Intercept History pushes
    History.prototype.pushState = function(state, unused, url) {
      const target = url ? String(url) : '';
      if (target && shouldBlockNavigation(target, 'window')) {
        dispatchBlockEvent('window', target);
        return;
      }
      return originalPushState.apply(this, arguments);
    };

    History.prototype.replaceState = function(state, unused, url) {
      const target = url ? String(url) : '';
      if (target && shouldBlockNavigation(target, 'window')) {
        dispatchBlockEvent('window', target);
        return;
      }
      return originalReplaceState.apply(this, arguments);
    };

    // Intercept direct DOM anchor clicks
    HTMLAnchorElement.prototype.click = function() {
      const href = this.href || this.getAttribute('href');
      if (href && shouldBlockNavigation(href, 'redirect')) {
        dispatchBlockEvent('redirect', href);
        return;
      }
      return originalAnchorClick.apply(this, arguments);
    };

    HTMLAreaElement.prototype.click = function() {
      const href = this.href || this.getAttribute('href');
      if (href && shouldBlockNavigation(href, 'redirect')) {
        dispatchBlockEvent('redirect', href);
        return;
      }
      return originalAreaClick.apply(this, arguments);
    };

    // Intercept programmatic form submissions
    HTMLFormElement.prototype.submit = function() {
      const action = this.action || this.getAttribute('action');
      if (action && shouldBlockNavigation(action, 'redirect')) {
        dispatchBlockEvent('redirect', action);
        return;
      }
      return originalSubmit.apply(this, arguments);
    };
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
  }

  // Hook elements
  applyOverrides();

  // Listen to synchronizations updates from Content Script
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== 'REDIRECT_SHIELD_CONFIG_UPDATE') return;
    config = e.data.config;

    // Restore original browser methods if shield is disabled or page whitelisted
    if (!config.enabled || config.isWhitelisted) {
      restoreOriginals();
    }
  });

  // Trap capture-phase click events on anchor selectors
  document.addEventListener('click', function(event) {
    if (!config.enabled || config.isWhitelisted) return;

    let target = event.target;
    while (target && target !== document) {
      const tag = target.tagName ? target.tagName.toUpperCase() : '';
      
      // Target blank conversion to current tab target
      if (tag === 'A' && target.target === '_blank') {
        const href = target.href || target.getAttribute('href');
        if (isExternalUrl(href, window.location.hostname) && config.protectionLevel !== 'basic') {
          target.target = '_self';
        }
      }

      if (tag === 'A' || tag === 'AREA' || target.hasAttribute('onclick')) {
        const href = target.href || target.getAttribute('href');
        if (href && shouldBlockNavigation(href, 'redirect')) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          dispatchBlockEvent('redirect', href);
          return;
        }
      }
      target = target.parentNode || target.host;
    }
  }, true);
})();
