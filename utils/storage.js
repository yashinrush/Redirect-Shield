/**
 * Redirect Shield AI - Storage Utility
 * Promise-based wrappers for storage operations and statistics sync.
 * Compatible with Service Workers (background), Content Scripts, Popups, and Options contexts.
 */
(function() {
  const globalScope = typeof self !== 'undefined' ? self : window;

  const DEFAULT_SETTINGS = {
    enabled: true,
    protectionLevel: 'balanced', // 'basic', 'balanced', 'advanced', 'maximum'
    whitelist: [
      'youtube.com',
      'github.com',
      'google.com',
      'stackoverflow.com',
      'wikipedia.org',
      'microsoft.com',
      'apple.com'
    ],
    blacklist: [],
    customLevels: {}, // Custom overrides per-domain (e.g. "example.com": "maximum")
    showToasts: true,
    consoleLogging: true,
    autoRemoveOverlays: true,
    detectFakeDownloads: true,
    theme: 'dark',
    stats: {
      total: { redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 },
      daily: { date: '', redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 },
      weekly: { startOfWeek: '', redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 },
      monthly: { startOfMonth: '', redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 },
      topDomains: {} // Track domains blocked the most: { "adsite.com": 5 }
    }
  };

  class StorageManager {
    /**
     * Get value for keys from chrome.storage.local
     * @param {Array|string|null} keys - Keys to fetch (null retrieves all)
     * @returns {Promise<Object>}
     */
    get(keys) {
      return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => {
          resolve(result);
        });
      });
    }

    /**
     * Set values in chrome.storage.local
     * @param {Object} data - Key-value map to store
     * @returns {Promise<void>}
     */
    set(data) {
      return new Promise((resolve) => {
        chrome.storage.local.set(data, () => {
          resolve();
        });
      });
    }

    /**
     * Get all settings including lists and preferences, applying defaults
     * @returns {Promise<Object>}
     */
    async getSettings() {
      const data = await this.get(null);
      const settings = {};
      for (const key in DEFAULT_SETTINGS) {
        settings[key] = data[key] !== undefined ? data[key] : DEFAULT_SETTINGS[key];
      }
      return settings;
    }

    /**
     * Initialize defaults if not already present
     */
    async initializeDefaults() {
      const data = await this.get(null);
      const updates = {};
      let needsUpdate = false;

      for (const key in DEFAULT_SETTINGS) {
        if (data[key] === undefined) {
          updates[key] = DEFAULT_SETTINGS[key];
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await this.set(updates);
        if (globalScope.RedirectShieldLogger) {
          globalScope.RedirectShieldLogger.info('Initialized default storage settings.');
        }
      }
    }

    /**
     * Helper to retrieve clean date strings for statistics tracking
     * @returns {Object} { dailyStr, weeklyStr, monthlyStr }
     */
    getDateStrings() {
      const now = new Date();
      const dailyStr = now.toISOString().split('T')[0];

      // Monday calculations
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      const weeklyStr = monday.toISOString().split('T')[0];

      // Monthly
      const monthlyStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      return { dailyStr, weeklyStr, monthlyStr };
    }

    /**
     * Records a blocked event and updates daily/weekly/monthly/lifetime stats
     * @param {string} blockType - 'popup', 'redirect', 'overlay', 'deceptive'
     * @param {string} blockedUrl - Target URL blocked
     * @returns {Promise<Object>} Updated stats
     */
    async recordBlockEvent(blockType, blockedUrl) {
      const settings = await this.getSettings();
      const stats = settings.stats || DEFAULT_SETTINGS.stats;
      const { dailyStr, weeklyStr, monthlyStr } = this.getDateStrings();

      // Check date expirations and roll values
      if (stats.daily.date !== dailyStr) {
        stats.daily = { date: dailyStr, redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 };
      }
      if (stats.weekly.startOfWeek !== weeklyStr) {
        stats.weekly = { startOfWeek: weeklyStr, redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 };
      }
      if (stats.monthly.startOfMonth !== monthlyStr) {
        stats.monthly = { startOfMonth: monthlyStr, redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 };
      }

      const keyMap = {
        popup: 'popups',
        redirect: 'redirects',
        overlay: 'overlays',
        deceptive: 'deceptive'
      };
      const key = keyMap[blockType] || 'redirects';

      // Increment values
      stats.total[key]++;
      stats.total.total++;
      stats.daily[key]++;
      stats.daily.total++;
      stats.weekly[key]++;
      stats.weekly.total++;
      stats.monthly[key]++;
      stats.monthly.total++;

      // Track top blocked domains (capped at 15 items)
      if (blockedUrl && blockedUrl !== 'Overlay removed' && blockedUrl !== 'Ad Container removed' && blockedUrl !== 'Deceptive Element dismissed') {
        try {
          let host = blockedUrl;
          if (host.includes('://')) {
            host = new URL(host).hostname;
          }
          const hostParts = host.split('.');
          const rootDomain = hostParts.length > 2 ? hostParts.slice(-2).join('.') : host;

          if (rootDomain) {
            stats.topDomains[rootDomain] = (stats.topDomains[rootDomain] || 0) + 1;
            const sorted = Object.entries(stats.topDomains)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15);
            stats.topDomains = Object.fromEntries(sorted);
          }
        } catch (e) {
          // Ignore domain parsing failure
        }
      }

      await this.set({ stats });
      return stats;
    }

    /**
     * Resets statistics to zero
     */
    async resetStats() {
      const stats = {
        total: { redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 },
        daily: { date: '', redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 },
        weekly: { startOfWeek: '', redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 },
        monthly: { startOfMonth: '', redirects: 0, popups: 0, overlays: 0, deceptive: 0, total: 0 },
        topDomains: {}
      };
      await this.set({ stats });
    }
  }

  // Export globally
  globalScope.RedirectShieldStorage = new StorageManager();
})();
