/**
 * Redirect Shield AI - Invisible Overlay Shield
 * Identifies and eliminates full-viewport click-hijacking transparent overlay layers.
 * Compatible with Content Scripts, Popups, and Options contexts.
 */
(function() {
  const globalScope = typeof self !== 'undefined' ? self : window;

  const OverlayShield = {
    /**
     * Scans and removes invisible/transparent layers configured to hijack clicks
     * @param {Object} settings - Loaded extension configuration
     * @returns {boolean} True if any overlays were removed
     */
    removeInvisibleOverlays: function(settings) {
      if (!settings.enabled || settings.autoRemoveOverlays === false) return false;

      const elements = document.querySelectorAll('div, section, span, a');
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let removedAny = false;

      elements.forEach(element => {
        // Exclude critical wrapper layers, body tags, and toast notification shadows
        if (
          element === document.body || 
          element === document.documentElement || 
          element.id === 'redirect-shield-toast-container' ||
          element.closest('#redirect-shield-toast-container')
        ) {
          return;
        }

        try {
          const style = window.getComputedStyle(element);
          const position = style.position;
          
          // Overlays must have fixed or absolute positioning
          if (position !== 'fixed' && position !== 'absolute') return;

          const width = element.offsetWidth;
          const height = element.offsetHeight;
          
          // Verify if overlay covers a significant portion of the browser viewport
          const isSpanning = (width >= vw * 0.85 && height >= vh * 0.85) ||
                             style.width === '100vw' || style.height === '100vh' ||
                             (style.width === '100%' && style.height === '100%');

          if (!isSpanning) return;

          const zIndex = parseInt(style.zIndex, 10);
          // Only inspect z-indices above 80 (where click layers sit)
          if (zIndex < 80 || isNaN(zIndex)) return;

          const bg = style.backgroundColor;
          const opacity = parseFloat(style.opacity);
          
          // Determine if element is transparent
          const isTransparent = bg === 'transparent' || 
                                bg.includes('rgba(') && (bg.endsWith(', 0)') || bg.split(',')[3].trim().startsWith('0)')) ||
                                opacity < 0.12;

          // Transparent layers must capture click events (pointer-events not none)
          const hasPointerEvents = style.pointerEvents !== 'none';

          if (isTransparent && hasPointerEvents) {
            const textLength = element.textContent.trim().length;
            const childInputsCount = element.querySelectorAll('input, button, select, textarea').length;
            
            // Allow login modals and interactive menus: skip if they contain text or forms
            if (textLength < 60 && childInputsCount === 0) {
              element.remove();
              removedAny = true;

              if (globalScope.RedirectShieldLogger) {
                globalScope.RedirectShieldLogger.warn(`Removed invisible click-hijack overlay (z-index: ${zIndex})`);
              }

              // Post status update to content script to broadcast block tracking
              window.postMessage({
                type: 'REDIRECT_SHIELD_OVERLAY_BLOCKED',
                detail: { url: `Transparent Overlay (z-index: ${zIndex})` }
              }, '*');
            }
          }
        } catch (err) {
          // Fail-safe silent continue
        }
      });

      return removedAny;
    },

    /**
     * Sweeps and deletes dynamic advertisement containers based on popular vendor selectors
     */
    removeCommonAdElements: function() {
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
          
          if (globalScope.RedirectShieldLogger) {
            globalScope.RedirectShieldLogger.debug('Removed dynamic ad overlay element.');
          }

          window.postMessage({
            type: 'REDIRECT_SHIELD_OVERLAY_BLOCKED',
            detail: { url: 'Ad Container element' }
          }, '*');
        });
      } catch (e) {
        // Fail-safe silent continue
      }
    }
  };

  // Export globally
  globalScope.RedirectShieldOverlay = OverlayShield;
})();
