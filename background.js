/**
 * Redirect Shield AI - Background Service Worker
 * Coordinates global storage synchronization, badge labels, and statistics logs.
 * Compatible with Manifest V3.
 */

// Import required utilities inside Service Worker context
importScripts(
  'utils/logger.js',
  'utils/storage.js',
  'utils/helpers.js',
  'utils/rules.js'
);

const logger = RedirectShieldLogger;
const storage = RedirectShieldStorage;

// Set threshold level for the logger
logger.setLevel('INFO');

// Track recent blocked events log per tabId (in-memory)
const tabBlockLogs = {};

// Clean up tabBlockLogs when tab is closed to prevent leaks
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabBlockLogs[tabId];
});

// Synchronize badge UI on start and installation
chrome.runtime.onInstalled.addListener(() => {
  storage.initializeDefaults().then(() => {
    updateBadge();
    logger.info('Service worker installed and initialized defaults.');
  });
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

/**
 * Updates extension action badge text (ON/OFF) based on active state
 */
async function updateBadge() {
  try {
    const settings = await storage.getSettings();
    const isEnabled = settings.enabled !== false;

    if (isEnabled) {
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Safe Green
      chrome.action.setBadgeText({ text: 'ON' });
    } else {
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Dangerous Red
      chrome.action.setBadgeText({ text: 'OFF' });
    }
  } catch (err) {
    logger.error('Failed to update action badge.', err);
  }
}

/**
 * Listener for runtime communications across content scripts, popup, and options page
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  const tabId = sender.tab ? sender.tab.id : null;

  if (message.type === 'REDIRECT_SHIELD_GET_TAB_CONFIG') {
    // Content script query for page configurations
    const url = message.url || '';
    
    storage.getSettings().then((settings) => {
      let host = '';
      if (url) {
        try {
          host = new URL(url).hostname;
        } catch (e) {
          host = url;
        }
      }

      const cleanHost = host.toLowerCase();
      const isWhitelisted = RedirectShieldRules.isHostMatchedInList(cleanHost, settings.whitelist || []);
      const isBlacklisted = RedirectShieldRules.isHostMatchedInList(cleanHost, settings.blacklist || []);
      
      const config = {
        enabled: settings.enabled !== false,
        protectionLevel: RedirectShieldRules.getEffectiveProtectionLevel(settings, cleanHost),
        isWhitelisted: isWhitelisted,
        isBlacklisted: isBlacklisted,
        showToasts: settings.showToasts !== false,
        consoleLogging: settings.consoleLogging !== false,
        autoRemoveOverlays: settings.autoRemoveOverlays !== false,
        detectFakeDownloads: settings.detectFakeDownloads !== false
      };

      sendResponse(config);
    }).catch(err => {
      logger.error('Failed to resolve tab config.', err);
      sendResponse(null);
    });

    return true; // Keep message channel open for async promise response

  } else if (message.type === 'REDIRECT_SHIELD_BLOCKED_EVENT') {
    // Record redirection block and update stats logs
    const { blockType, blockedUrl } = message.detail;
    
    // Add to in-memory tab log cache
    if (tabId) {
      if (!tabBlockLogs[tabId]) tabBlockLogs[tabId] = [];
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      tabBlockLogs[tabId].unshift({
        type: blockType,
        url: blockedUrl,
        time: timeStr
      });
      if (tabBlockLogs[tabId].length > 5) tabBlockLogs[tabId].pop();
    }

    storage.recordBlockEvent(blockType, blockedUrl).then((updatedStats) => {
      logger.info(`Blocked event logged: [${blockType}] target: ${blockedUrl}`);
      
      // Update badge block count for this tab if running inside a page context
      if (tabId) {
        chrome.action.setBadgeText({ tabId, text: '!' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#ff9f00' }); // Warn Orange
      }

      // Broadcast changes to active popup/options page if open
      chrome.runtime.sendMessage({
        type: 'REDIRECT_SHIELD_STATS_UPDATED',
        stats: updatedStats,
        tabId: tabId,
        tabLogs: tabId ? tabBlockLogs[tabId] : []
      }).catch(() => {
        // Safe to ignore: occurs when UI screens are closed
      });

      sendResponse({ status: 'success' });
    }).catch(err => {
      logger.error('Failed to log blocked event.', err);
      sendResponse({ status: 'error' });
    });

    return true;

  } else if (message.type === 'REDIRECT_SHIELD_GET_TAB_LOGS') {
    const qTabId = message.tabId;
    sendResponse(tabBlockLogs[qTabId] || []);
    return false;

  } else if (message.type === 'REDIRECT_SHIELD_TOGGLE_STATE') {
    // Toggle overall protection state
    storage.getSettings().then((settings) => {
      const newState = !settings.enabled;
      
      storage.set({ enabled: newState }).then(() => {
        updateBadge();
        
        // Notify all active tabs to refresh rule parameters
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'REDIRECT_SHIELD_STATE_CHANGED', enabled: newState }).catch(() => {});
          });
        });

        sendResponse({ enabled: newState });
      });
    }).catch(err => {
      logger.error('Failed to toggle protection state.', err);
      sendResponse(null);
    });

    return true;
  }
});

/**
 * Handle registered keyboard commands
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-protection') {
    try {
      const settings = await storage.getSettings();
      const newState = !settings.enabled;
      
      await storage.set({ enabled: newState });
      updateBadge();
      logger.info(`Toggled protection via hotkey to: ${newState}`);
      
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'REDIRECT_SHIELD_STATE_CHANGED', enabled: newState }).catch(() => {});
      });
    } catch (err) {
      logger.error('Hotkey toggle handler failed.', err);
    }
  }
});
