/**
 * Redirect Shield AI - Helper Utilities
 * Collection of URL parsers, network checks, performance throttle/debounce, and DOM query helpers.
 * Compatible with Service Workers (background), Content Scripts, Popups, and Options contexts.
 */
(function() {
  const globalScope = typeof self !== 'undefined' ? self : window;

  const Helpers = {
    /**
     * Parses the root domain from a given URL or hostname string
     * e.g. "sub.example.co.uk" -> "example.co.uk", "test.site.com" -> "site.com"
     * @param {string} urlStr - Target URL or host
     * @returns {string} Clean root domain
     */
    getRootDomain: function(urlStr) {
      if (!urlStr) return '';
      try {
        let hostname = urlStr.trim().toLowerCase();
        if (hostname.includes('://')) {
          hostname = new URL(hostname).hostname;
        } else {
          // Virtual URL parser for clean hostname extraction
          hostname = new URL('http://' + hostname).hostname;
        }

        const parts = hostname.split('.');
        if (parts.length <= 2) return hostname;

        // Common multi-part TLD matching (co.uk, com.br, net.au, etc.)
        const multiPartTlds = ['co', 'com', 'net', 'org', 'edu', 'gov', 'asn', 'id'];
        const secondToLast = parts[parts.length - 2];
        const last = parts[parts.length - 1];

        if (multiPartTlds.includes(secondToLast) && parts.length > 2) {
          return parts.slice(-3).join('.');
        }

        return parts.slice(-2).join('.');
      } catch (e) {
        return urlStr || '';
      }
    },

    /**
     * Verifies if a domain string contains a valid syntax structure
     * @param {string} domainStr - Domain string to check
     * @returns {boolean}
     */
    isValidDomain: function(domainStr) {
      if (!domainStr || typeof domainStr !== 'string') return false;
      const clean = domainStr.trim().toLowerCase();
      if (!clean.includes('.') || clean.startsWith('.') || clean.endsWith('.')) return false;
      
      const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;
      return domainRegex.test(clean);
    },

    /**
     * Checks if a target URL leads to an external domain compared to the source host
     * @param {string} targetUrlStr - Destination URL
     * @param {string} sourceHost - Current page hostname
     * @returns {boolean}
     */
    isExternalUrl: function(targetUrlStr, sourceHost) {
      if (!targetUrlStr) return false;
      const trimUrl = targetUrlStr.trim();
      
      // Allow relative local paths, anchor hashes, and javascript hooks
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

        // Subdomain checking: allow matches like "static.example.com" on "example.com"
        const targetRoot = this.getRootDomain(targetHost);
        const sourceRoot = this.getRootDomain(sourceHostLower);

        return targetRoot !== sourceRoot;
      } catch (e) {
        return false;
      }
    },

    /**
     * Creates a throttled wrapper executing at most once per duration
     * @param {Function} func - Callback function
     * @param {number} limit - Throttle milliseconds
     * @returns {Function} Throttled function
     */
    throttle: function(func, limit) {
      let inThrottle;
      return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      }
    },

    /**
     * Creates a debounced wrapper executing only after duration delay has elapsed
     * @param {Function} func - Callback function
     * @param {number} delay - Debounce milliseconds
     * @returns {Function} Debounced function
     */
    debounce: function(func, delay) {
      let debounceTimer;
      return function() {
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
      }
    }
  };

  // Export globally
  globalScope.RedirectShieldHelpers = Helpers;
})();
