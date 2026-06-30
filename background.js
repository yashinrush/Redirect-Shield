/**
 * Redirect Shield - Background Service Worker
 * Manages extension state, storage, statistics, keyboard commands,
 * context menus, session tab pausing, and per-site overrides.
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
  siteOverrides: {}, // e.g. { "example.com": "low", "badsite.com": "extreme" }
  showToasts: true,
  consoleLogging: true,
  debugMode: false,
  autoRemoveOverlays: true,
  autoRulesUpdate: false,
  stats: {
    total: { redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
    daily: { date: '', redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
    weekly: { startOfWeek: '', redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
    monthly: { startOfMonth: '', redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
    topDomains: {}
  }
};

// In-memory session tracking
const tabBlockCounts = new Map();
const pausedTabIds = new Set(); // Track temporarily paused tabs in memory

// Initialize extension settings & menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['enabled'], (result) => {
    if (result.enabled === undefined) {
      chrome.storage.local.set(DEFAULT_SETTINGS, () => {
        console.log('[RedirectShield] Initialized default settings.');
        createContextMenus();
        updateBadge();
      });
    } else {
      createContextMenus();
      updateBadge();
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
  updateBadge();
});

// Setup Context Menus
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'toggle-shield',
      title: 'Toggle Redirect Shield (Global)',
      contexts: ['action', 'page']
    });
    chrome.contextMenus.create({
      id: 'whitelist-current',
      title: 'Whitelist current domain',
      contexts: ['action', 'page']
    });
    chrome.contextMenus.create({
      id: 'blacklist-current',
      title: 'Blacklist current domain',
      contexts: ['action', 'page']
    });
  });
}

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.url) return;
  const domain = getRootDomain(tab.url);
  if (!domain || tab.url.startsWith('chrome://')) return;

  if (info.menuItemId === 'toggle-shield') {
    const result = await chrome.storage.local.get(['enabled']);
    const newState = !result.enabled;
    await chrome.storage.local.set({ enabled: newState });
    updateBadge();
    notifyAllTabs();
  } else if (info.menuItemId === 'whitelist-current') {
    chrome.storage.local.get(['whitelist', 'blacklist'], (result) => {
      let whitelist = result.whitelist || [];
      let blacklist = result.blacklist || [];
      
      const wIdx = whitelist.indexOf(domain);
      if (wIdx === -1) {
        whitelist.push(domain);
        const bIdx = blacklist.indexOf(domain);
        if (bIdx > -1) blacklist.splice(bIdx, 1);
        
        chrome.storage.local.set({ whitelist, blacklist }, () => {
          chrome.tabs.reload(tab.id);
        });
      }
    });
  } else if (info.menuItemId === 'blacklist-current') {
    chrome.storage.local.get(['whitelist', 'blacklist'], (result) => {
      let whitelist = result.whitelist || [];
      let blacklist = result.blacklist || [];
      
      const bIdx = blacklist.indexOf(domain);
      if (bIdx === -1) {
        blacklist.push(domain);
        const wIdx = whitelist.indexOf(domain);
        if (wIdx > -1) whitelist.splice(wIdx, 1);
        
        chrome.storage.local.set({ whitelist, blacklist }, () => {
          chrome.tabs.reload(tab.id);
        });
      }
    });
  }
});

// Update Badge UI State
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

// Notify all open tabs of settings modifications
function notifyAllTabs() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'REDIRECT_SHIELD_STATE_CHANGED' }).catch(() => {});
    });
  });
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

// Get standard date strings for stats tracking
function getDateStrings() {
  const now = new Date();
  const dailyStr = now.toISOString().split('T')[0];
  
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  const weeklyStr = monday.toISOString().split('T')[0];
  
  const monthlyStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  
  return { dailyStr, weeklyStr, monthlyStr };
}

// Handle block event updates
async function recordBlockEvent(eventData, tabId) {
  const { blockType, blockedUrl } = eventData;
  const data = await chrome.storage.local.get(['stats']);
  const stats = data.stats || DEFAULT_SETTINGS.stats;
  
  const { dailyStr, weeklyStr, monthlyStr } = getDateStrings();
  
  if (stats.daily.date !== dailyStr) {
    stats.daily = { date: dailyStr, redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 };
  }
  if (stats.weekly.startOfWeek !== weeklyStr) {
    stats.weekly = { startOfWeek: weeklyStr, redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 };
  }
  if (stats.monthly.startOfMonth !== monthlyStr) {
    stats.monthly = { startOfMonth: monthlyStr, redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 };
  }

  const typeMap = {
    'popup': 'popups',
    'redirect': 'redirects',
    'overlay': 'overlays',
    'window': 'windows'
  };
  const key = typeMap[blockType] || 'redirects';

  stats.total[key]++;
  stats.total.total++;
  stats.daily[key]++;
  stats.daily.total++;
  stats.weekly[key]++;
  stats.weekly.total++;
  stats.monthly[key]++;
  stats.monthly.total++;

  if (blockedUrl && blockedUrl !== 'Overlay removed' && blockedUrl !== 'Ad Container removed') {
    const domain = getRootDomain(blockedUrl);
    if (domain) {
      stats.topDomains[domain] = (stats.topDomains[domain] || 0) + 1;
      const sorted = Object.entries(stats.topDomains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
      stats.topDomains = Object.fromEntries(sorted);
    }
  }

  await chrome.storage.local.set({ stats });

  if (tabId) {
    const currentTabCount = (tabBlockCounts.get(tabId) || 0) + 1;
    tabBlockCounts.set(tabId, currentTabCount);
    chrome.action.setBadgeText({ tabId, text: String(currentTabCount) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#10b981' });
  }

  chrome.runtime.sendMessage({ type: 'REDIRECT_SHIELD_STATS_UPDATED', stats }).catch(() => {});
}

// Clean up session resources on tab closing/navigation
chrome.tabs.onRemoved.addListener((tabId) => {
  tabBlockCounts.delete(tabId);
  pausedTabIds.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabBlockCounts.set(tabId, 0);
    updateBadge();
  }
});

// Listener for tab message queries
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderTabId = sender.tab ? sender.tab.id : null;

  if (message.type === 'REDIRECT_SHIELD_BLOCKED_EVENT') {
    recordBlockEvent(message.detail, senderTabId);
    sendResponse({ status: 'success' });
  } 
  
  else if (message.type === 'REDIRECT_SHIELD_TOGGLE_STATE') {
    chrome.storage.local.get(['enabled'], (result) => {
      const newState = !result.enabled;
      chrome.storage.local.set({ enabled: newState }, () => {
        updateBadge();
        notifyAllTabs();
        sendResponse({ enabled: newState });
      });
    });
    return true;
  } 
  
  else if (message.type === 'REDIRECT_SHIELD_GET_TAB_CONFIG') {
    const tabUrl = message.url;
    const domain = getRootDomain(tabUrl);

    chrome.storage.local.get([
      'enabled',
      'protectionLevel',
      'whitelist',
      'blacklist',
      'siteOverrides',
      'showToasts',
      'consoleLogging',
      'debugMode',
      'autoRemoveOverlays'
    ], (result) => {
      const isGlobalEnabled = result.enabled !== false;
      const isTabPaused = senderTabId ? pausedTabIds.has(senderTabId) : false;
      
      const whitelist = result.whitelist || [];
      const blacklist = result.blacklist || [];
      const siteOverrides = result.siteOverrides || {};
      
      const isWhitelisted = whitelist.some(item => domain === item || domain.endsWith('.' + item));
      const isBlacklisted = blacklist.some(item => domain === item || domain.endsWith('.' + item));
      
      // Determine protection level for this site (check overrides)
      let currentLevel = result.protectionLevel || 'high';
      if (siteOverrides[domain]) {
        currentLevel = siteOverrides[domain];
      }

      // If tab is temporarily paused or global protection is off, we bypass blocking
      const isShieldActive = isGlobalEnabled && !isTabPaused && !isWhitelisted;

      sendResponse({
        enabled: isShieldActive,
        protectionLevel: currentLevel,
        isWhitelisted,
        isBlacklisted,
        showToasts: result.showToasts !== false,
        consoleLogging: result.consoleLogging !== false,
        debugMode: !!result.debugMode,
        autoRemoveOverlays: result.autoRemoveOverlays !== false,
        isTabPaused
      });
    });
    return true; // Keep message channel open for async response
  } 
  
  else if (message.type === 'REDIRECT_SHIELD_PAUSE_TAB') {
    const { tabId, pause } = message.detail;
    if (pause) {
      pausedTabIds.add(tabId);
    } else {
      pausedTabIds.delete(tabId);
    }
    // Update badge to signal bypass visually on this specific tab
    if (pause) {
      chrome.action.setBadgeText({ tabId, text: 'PAUS' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#f59e0b' }); // Orange for paused tab
    } else {
      chrome.action.setBadgeText({ tabId, text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#10b981' });
    }
    sendResponse({ success: true });
  }
});

// Keyboard Commands Toggle listener
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-protection') {
    const result = await chrome.storage.local.get(['enabled']);
    const newState = !result.enabled;
    await chrome.storage.local.set({ enabled: newState });
    updateBadge();
    notifyAllTabs();
  }
});
