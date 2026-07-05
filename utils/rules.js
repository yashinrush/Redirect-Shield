/**
 * Redirect Shield AI - Protection Rules Classifier
 * Evaluates whether page redirects, popup tab creations, or overlay actions should be blocked
 * based on current protection levels, whitelists, and blacklists.
 * Compatible with Service Workers (background), Content Scripts, Popups, and Options contexts.
 */
(function() {
  const globalScope = typeof self !== 'undefined' ? self : window;

  const Rules = {
    /**
     * Checks if a target host is matched by list items (supports subdomain matching)
     * e.g. "sub.example.com" matches list item "example.com" or "*.example.com"
     * @param {string} host - Target host domain
     * @param {Array<string>} list - Storage array of list domains
     * @returns {boolean}
     */
    isHostMatchedInList: function(host, list) {
      if (!host || !list || !Array.isArray(list)) return false;
      const targetHost = host.trim().toLowerCase();

      return list.some(item => {
        const cleanedItem = item.trim().toLowerCase();
        if (targetHost === cleanedItem) return true;
        // Subdomain trailing check
        if (targetHost.endsWith('.' + cleanedItem)) return true;
        return false;
      });
    },

    /**
     * Evaluates the threat rating or protection level to apply for a domain
     * @param {Object} settings - Loaded extension storage config
     * @param {string} domain - Domain of the current active site
     * @returns {string} Effective level ('basic', 'balanced', 'advanced', 'maximum')
     */
    getEffectiveProtectionLevel: function(settings, domain) {
      if (!domain) return settings.protectionLevel || 'balanced';
      
      // Check if domain is blacklisted -> Force Maximum protection
      const isBlacklisted = this.isHostMatchedInList(domain, settings.blacklist || []);
      if (isBlacklisted) return 'maximum';

      // Check if custom protection override exists for this specific domain
      const customLevels = settings.customLevels || {};
      const hostParts = domain.split('.');
      
      // Check full domain first, then root domain
      if (customLevels[domain]) {
        return customLevels[domain];
      }
      
      if (globalScope.RedirectShieldHelpers) {
        const rootDomain = globalScope.RedirectShieldHelpers.getRootDomain(domain);
        if (customLevels[rootDomain]) {
          return customLevels[rootDomain];
        }
      }

      return settings.protectionLevel || 'balanced';
    },

    /**
     * Core redirect rules engine
     * Determines whether to permit or block a programmatic/navigation action
     * @param {Object} settings - Current settings loaded from storage
     * @param {string} currentHost - Host domain of the source page requesting redirect
     * @param {string} targetUrl - Redirection destination URL
     * @param {string} contextType - Intercept context ('popup', 'redirect', 'window')
     * @param {boolean} isUserAction - True if triggered within a valid, user-initiated click window
     * @returns {boolean} True if the action should be BLOCKED
     */
    shouldBlockAction: function(settings, currentHost, targetUrl, contextType, isUserAction) {
      // 1. If global protection is turned off, do not block anything
      if (settings.enabled === false) return false;

      // 2. If the current active site is whitelisted, fully bypass protection
      const isWhitelisted = this.isHostMatchedInList(currentHost, settings.whitelist || []);
      if (isWhitelisted) return false;

      // 3. System checks: Allow local, internal links and trusted single-sign-on OAuth providers
      if (globalScope.RedirectShieldHelpers) {
        const isExternal = globalScope.RedirectShieldHelpers.isExternalUrl(targetUrl, currentHost);
        if (!isExternal) return false;

        const targetHost = new URL(targetUrl.includes('://') ? targetUrl : 'http://' + targetUrl).hostname;
        const trustedOauth = [
          'accounts.google.com', 'github.com', 'facebook.com', 'twitter.com', 'x.com',
          'linkedin.com', 'appleid.apple.com', 'okta.com', 'auth0.com', 'discord.com'
        ];
        const isTrustedAuth = trustedOauth.some(d => targetHost === d || targetHost.endsWith('.' + d));
        if (isTrustedAuth && isUserAction) return false;
      }

      // 4. Resolve the protection rules based on effective level
      const level = this.getEffectiveProtectionLevel(settings, currentHost);

      switch (level) {
        case 'basic':
          // Basic protection: Only block programmatic popups (window.open) not triggered by clicks.
          // Allow all page redirects and user-triggered tabs.
          if (contextType === 'popup') {
            return !isUserAction;
          }
          return false;

        case 'balanced':
          // Balanced protection: Block all non-user-clicked popups and redirects.
          // Legitimate clicks on standard HTML elements are permitted.
          return !isUserAction;

        case 'advanced':
          // Advanced protection (Recommended): Blocks popups, redirects, and overlays.
          // In addition, programmatic window changes (href triggers) inside click listeners are blocked
          // to prevent ad-hooks from hijack clicking.
          if (!isUserAction) return true;
          // Block programmatic page redirections (location assignments / href set)
          if (contextType === 'redirect') return true;
          return false;

        case 'maximum':
          // Maximum protection: Lock down all external navigations.
          // Any external navigation or popup attempt is blocked, regardless of clicks.
          return true;

        default:
          return false;
      }
    }
  };

  // Export globally
  globalScope.RedirectShieldRules = Rules;
})();
