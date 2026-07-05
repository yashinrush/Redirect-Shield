/**
 * Redirect Shield AI - Threat & Reputation Detector
 * Local heuristics for domain safety ratings and deceptive download link indicators.
 * Compatible with Content Scripts, Popups, and Options contexts.
 */
(function() {
  const globalScope = typeof self !== 'undefined' ? self : window;

  const Detector = {
    // Suspicious Top Level Domains commonly associated with ad servers or redirects
    SUSPICIOUS_TLDS: [
      'xyz', 'top', 'click', 'download', 'loan', 'vip', 'work', 'gq', 'cf', 
      'tk', 'ml', 'fit', 'club', 'date', 'cam', 'monster', 'online', 'space',
      'stream', 'live', 'bid', 'win', 'downloading'
    ],

    // Target text keywords indicative of fake or deceptive play/download buttons
    DECEPTIVE_TEXTS: [
      'download now', 'start download', 'free download', 'download pdf',
      'fast download', 'play now', 'start playing', 'watch hd', 'download setup',
      'high speed download', 'click to download', 'direct download'
    ],

    /**
     * Assesses a domain reputation grade locally without network overhead
     * @param {Object} settings - Extension settings
     * @param {string} domain - Domain name to rate
     * @returns {string} Rating grade: 'safe', 'warning', 'suspicious'
     */
    assessDomainReputation: function(settings, domain) {
      if (!domain) return 'safe';
      const cleanDomain = domain.trim().toLowerCase();

      // 1. Whitelisted domains are always rated safe
      if (globalScope.RedirectShieldRules && globalScope.RedirectShieldRules.isHostMatchedInList(cleanDomain, settings.whitelist || [])) {
        return 'safe';
      }

      // 2. Blacklisted domains are always rated suspicious
      if (globalScope.RedirectShieldRules && globalScope.RedirectShieldRules.isHostMatchedInList(cleanDomain, settings.blacklist || [])) {
        return 'suspicious';
      }

      // 3. Heuristic checks on TLD suffix
      const parts = cleanDomain.split('.');
      const tld = parts[parts.length - 1];
      if (this.SUSPICIOUS_TLDS.includes(tld)) {
        return 'warning';
      }

      // 4. Block frequency check (if this domain has been blocked frequently)
      const stats = settings.stats || {};
      const topDomains = stats.topDomains || {};
      const blockCount = topDomains[cleanDomain] || 0;

      if (blockCount > 8) {
        return 'suspicious';
      } else if (blockCount > 2) {
        return 'warning';
      }

      return 'safe';
    },

    /**
     * Analyzes DOM nodes to detect deceptive fake download buttons
     * @param {HTMLElement} element - DOM element to inspect
     * @returns {Object|null} Suspicion details or null if safe
     */
    detectDeceptiveElement: function(element) {
      if (!element || !element.tagName) return null;
      const tag = element.tagName.toUpperCase();

      // We focus on anchors, buttons, generic clickable containers, and direct images
      if (tag !== 'A' && tag !== 'BUTTON' && tag !== 'DIV' && tag !== 'SPAN' && tag !== 'IMG') {
        return null;
      }

      // 1. Inspect file download anchor targets
      if (tag === 'A') {
        const href = element.getAttribute('href') || '';
        const targetLower = href.toLowerCase();
        
        // Check if target link ends with dangerous executable suffixes
        const isDangerousFile = targetLower.endsWith('.exe') || 
                                targetLower.endsWith('.msi') || 
                                targetLower.endsWith('.dmg') ||
                                targetLower.endsWith('.apk') ||
                                targetLower.endsWith('.bat');

        if (isDangerousFile) {
          // If the link points to a dangerous executable on an external domain, flag it
          if (globalScope.RedirectShieldHelpers) {
            const isExternal = globalScope.RedirectShieldHelpers.isExternalUrl(href, window.location.hostname);
            if (isExternal) {
              return {
                element: element,
                reason: 'Direct external link to executable file (.exe/.msi/.apk)',
                severity: 'suspicious'
              };
            }
          }
        }
      }

      // 2. Text matching heuristics
      let nodeText = '';
      if (tag === 'IMG') {
        // Evaluate image source names or alt texts
        const src = element.getAttribute('src') || '';
        const alt = element.getAttribute('alt') || '';
        nodeText = `${src} ${alt}`.toLowerCase();
      } else {
        nodeText = element.textContent.trim().toLowerCase();
      }

      const hasKeyword = this.DECEPTIVE_TEXTS.some(keyword => nodeText.includes(keyword));
      if (hasKeyword) {
        // If element is styled conspicuously, e.g. position fixed/absolute, large z-index
        const style = window.getComputedStyle(element);
        const position = style.position;
        const zIndex = parseInt(style.zIndex, 10);
        
        // Deceptive indicators: float, flash button banners, or z-index overlays with download triggers
        const hasOverlayIndications = (position === 'fixed' || position === 'absolute') && zIndex > 90;
        
        if (hasOverlayIndications) {
          return {
            element: element,
            reason: 'Floating deceptive play/download button banner detected',
            severity: 'suspicious'
          };
        }

        // Standard warning for text triggers
        return {
          element: element,
          reason: 'Deceptive text pattern match (e.g. Download Now / Play Now)',
          severity: 'warning'
        };
      }

      return null;
    },

    /**
     * Highlights dynamic deceptive elements and binds warning click prompts
     * @param {HTMLElement} element - SUSPICIOUS Element to highlight
     * @param {string} reason - Suspicion reason description
     */
    highlightDeceptiveElement: function(element, reason) {
      if (!element || element.dataset.redirectShieldFlagged) return;

      element.dataset.redirectShieldFlagged = 'true';

      // Apply distinct visual red dashboard warning bounds
      element.style.outline = '2px dashed #dc2626';
      element.style.outlineOffset = '2px';
      element.style.position = 'relative';

      // Create a warning tooltip badge element
      const badge = document.createElement('span');
      badge.textContent = '⚠ Security Warning: ' + reason;
      Object.assign(badge.style, {
        position: 'absolute',
        top: '-20px',
        left: '4px',
        background: '#dc2626',
        color: '#ffffff',
        fontSize: '10px',
        fontWeight: 'bold',
        padding: '2px 6px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        zIndex: '999999',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        pointerEvents: 'none'
      });

      try {
        if (element.style.position === 'static' || !element.style.position) {
          element.style.position = 'relative';
        }
        element.appendChild(badge);
      } catch (e) {
        // Ignore nodes where child append fails (like elements with restricted styles)
      }

      // Interrupt click events on deceptive links to prompt user confirmation
      element.addEventListener('click', function(e) {
        const proceed = confirm(`Redirect Shield Alert:\n\nThis button is flagged as: "${reason}".\n\nAre you sure you want to proceed?`);
        if (!proceed) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          // Dispatch confirmation block statistics update
          window.postMessage({
            type: 'REDIRECT_SHIELD_DECEPTIVE_DISMISSED',
            detail: { url: element.href || 'Deceptive link trigger' }
          }, '*');
        }
      }, true);
    }
  };

  // Export globally
  globalScope.RedirectShieldDetector = Detector;
})();
