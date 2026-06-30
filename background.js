/**
 * Redirect Shield - Background Service Worker
 * Manages extension state, storage, statistics, keyboard commands, and notifications.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  protectionLevel: 'high', // 'low', 'medium', 'high', 'extreme'
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
  showToasts: true,
  consoleLogging: true,
  autoRemoveOverlays: true,
  stats: {
    total: { redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
    daily: { date: '', redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
    weekly: { startOfWeek: '', redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
    monthly: { startOfMonth: '', redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
    topDomains: {}
  }
};

// In-memory tab block counts
const tabBlockCounts = new Map();

// Initialize extension settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['enabled'], (result) => {
    if (result.enabled === undefined) {
      chrome.storage.local.set(DEFAULT_SETTINGS, () => {
        console.log('[RedirectShield] Initialized default settings.');
        updateBadge();
      });
    } else {
      updateBadge();
    }
  });
});

// Update badge state based on global status
async function updateBadge() {
  const data = await chrome.storage.local.get(['enabled']);
  const isEnabled = data.enabled !== false;

  if (isEnabled) {
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Green for active
    chrome.action.setBadgeText({ text: 'ON' });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red for inactive
    chrome.action.setBadgeText({ text: 'OFF' });
  }
}

// Helper to extract root domain (e.g. sub.example.com -> example.com)
function getRootDomain(urlStr) {
  try {
    if (!urlStr) return '';
    const url = new URL(urlStr);
    const parts = url.hostname.split('.');
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }
    return url.hostname;
  } catch (e) {
    return urlStr || '';
  }
}

// Get standard date strings for statistics tracking
function getDateStrings() {
  const now = new Date();
  
  // Daily Date String (YYYY-MM-DD)
  const dailyStr = now.toISOString().split('T')[0];
  
  // Weekly Start Date (Monday)
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(now.setDate(diff));
  const weeklyStr = monday.toISOString().split('T')[0];
  
  // Monthly Start Date (YYYY-MM-01)
  const monthlyStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  
  return { dailyStr, weeklyStr, monthlyStr };
}

// Handle block event logic and update stats in storage
async function recordBlockEvent(eventData, tabId) {
  const { blockType, blockedUrl, sourceDomain } = eventData;
  const data = await chrome.storage.local.get(['stats']);
  const stats = data.stats || DEFAULT_SETTINGS.stats;
  
  const { dailyStr, weeklyStr, monthlyStr } = getDateStrings();
  
  // Verify/Reset daily stats
  if (stats.daily.date !== dailyStr) {
    stats.daily = { date: dailyStr, redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 };
  }
  
  // Verify/Reset weekly stats
  if (stats.weekly.startOfWeek !== weeklyStr) {
    stats.weekly = { startOfWeek: weeklyStr, redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 };
  }
  
  // Verify/Reset monthly stats
  if (stats.monthly.startOfMonth !== monthlyStr) {
    stats.monthly = { startOfMonth: monthlyStr, redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 };
  }

  // Define property key mapping
  const typeMap = {
    'popup': 'popups',
    'redirect': 'redirects',
    'overlay': 'overlays',
    'window': 'windows'
  };
  const key = typeMap[blockType] || 'redirects';

  // Increment total stats
  stats.total[key]++;
  stats.total.total++;

  // Increment daily stats
  stats.daily[key]++;
  stats.daily.total++;

  // Increment weekly stats
  stats.weekly[key]++;
  stats.weekly.total++;

  // Increment monthly stats
  stats.monthly[key]++;
  stats.monthly.total++;

  // Track top blocked domains (limit to top 15)
  if (blockedUrl) {
    const domain = getRootDomain(blockedUrl);
    if (domain) {
      stats.topDomains[domain] = (stats.topDomains[domain] || 0) + 1;
      
      // Keep sorted and limit size
      const sorted = Object.entries(stats.topDomains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
      stats.topDomains = Object.fromEntries(sorted);
    }
  }

  // Save back to storage
  await chrome.storage.local.set({ stats });

  // Update tab-specific counters and badge text temporarily
  if (tabId) {
    const currentTabCount = (tabBlockCounts.get(tabId) || 0) + 1;
    tabBlockCounts.set(tabId, currentTabCount);
    chrome.action.setBadgeText({ tabId, text: String(currentTabCount) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#10b981' });
  }

  // Send update notification to options page / popup if open
  chrome.runtime.sendMessage({ type: 'REDIRECT_SHIELD_STATS_UPDATED', stats }).catch(() => {
    // Ignore error if popup/options is not open
  });
}

// Clean up tab stats on close/navigation
chrome.tabs.onRemoved.addListener((tabId) => {
  tabBlockCounts.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabBlockCounts.set(tabId, 0); // Reset for new page load
    updateBadge(); // Revert to global badge
  }
});

// Listener for runtime messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REDIRECT_SHIELD_BLOCKED_EVENT') {
    const tabId = sender.tab ? sender.tab.id : null;
    recordBlockEvent(message.detail, tabId);
    sendResponse({ status: 'success' });
  } else if (message.type === 'REDIRECT_SHIELD_TOGGLE_STATE') {
    chrome.storage.local.get(['enabled'], (result) => {
      const newState = !result.enabled;
      chrome.storage.local.set({ enabled: newState }, () => {
        updateBadge();
        // Broadcast change to all tabs
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'REDIRECT_SHIELD_STATE_CHANGED', enabled: newState }).catch(() => {});
          });
        });
        sendResponse({ enabled: newState });
      });
    });
    return true; // Keep channel open for async response
  }
});

// Handle hotkey command commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-protection') {
    const result = await chrome.storage.local.get(['enabled']);
    const newState = !result.enabled;
    await chrome.storage.local.set({ enabled: newState });
    updateBadge();
    
    // Notify all tabs
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'REDIRECT_SHIELD_STATE_CHANGED', enabled: newState }).catch(() => {});
    });
  }
});
