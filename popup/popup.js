/**
 * Redirect Shield - Popup Logic
 * Coordinates toggle state, active website details, and real-time statistics counters.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const powerSection = document.querySelector('.power-section');
  const powerToggleBtn = document.getElementById('power-toggle-btn');
  const statusLabel = document.getElementById('protection-status-label');
  const levelBadge = document.getElementById('protection-level-badge');
  
  const currentDomainEl = document.getElementById('current-domain');
  const siteStatusEl = document.getElementById('site-status');
  const whitelistBtn = document.getElementById('whitelist-site-btn');
  const blacklistBtn = document.getElementById('blacklist-site-btn');
  
  const statTodayEl = document.getElementById('stat-today');
  const statTotalEl = document.getElementById('stat-total');
  const statPopupsEl = document.getElementById('stat-popups');
  const statOverlaysEl = document.getElementById('stat-overlays');
  
  const openSettingsBtn = document.getElementById('open-settings-btn');
  const resetStatsBtn = document.getElementById('reset-stats-btn');
  const dashboardBtn = document.getElementById('dashboard-btn');

  let currentDomain = '';
  let extensionConfig = {};

  // Initialize page configuration
  async function init() {
    // 1. Get current active tab domain details
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    if (activeTab && activeTab.url) {
      try {
        const url = new URL(activeTab.url);
        // Exclude system protocols
        if (url.protocol.startsWith('http')) {
          currentDomain = url.hostname.toLowerCase();
          currentDomainEl.textContent = currentDomain;
        } else {
          currentDomain = '';
          currentDomainEl.textContent = 'System Page';
          whitelistBtn.disabled = true;
          blacklistBtn.disabled = true;
        }
      } catch (err) {
        currentDomain = '';
        currentDomainEl.textContent = 'Unknown Page';
        whitelistBtn.disabled = true;
        blacklistBtn.disabled = true;
      }
    } else {
      currentDomain = '';
      currentDomainEl.textContent = 'Unknown Page';
      whitelistBtn.disabled = true;
      blacklistBtn.disabled = true;
    }

    // 2. Fetch and render state from storage
    updateUI();
  }

  // Reload config and update all elements
  function updateUI() {
    chrome.storage.local.get([
      'enabled',
      'protectionLevel',
      'whitelist',
      'blacklist',
      'stats'
    ], (result) => {
      extensionConfig = result;
      const isEnabled = result.enabled !== false;
      const level = result.protectionLevel || 'high';
      const whitelist = result.whitelist || [];
      const blacklist = result.blacklist || [];
      const stats = result.stats || {
        total: { total: 0, popups: 0, overlays: 0 },
        daily: { total: 0 }
      };

      // Set General Switch State
      if (isEnabled) {
        powerSection.classList.add('active');
        statusLabel.textContent = 'Shield Active';
      } else {
        powerSection.classList.remove('active');
        statusLabel.textContent = 'Shield Inactive';
      }

      // Render Level Badge
      levelBadge.textContent = `${level.charAt(0).toUpperCase() + level.slice(1)} Protection`;

      // Set Site Specific Status
      updateSiteStatus(isEnabled, whitelist, blacklist);

      // Render Stats Counters (animating numbers)
      animateCounter(statTodayEl, stats.daily.total || 0);
      animateCounter(statTotalEl, stats.total.total || 0);
      animateCounter(statPopupsEl, stats.total.popups || 0);
      animateCounter(statOverlaysEl, stats.total.overlays || 0);
    });
  }

  // Update current domain badge indicator and action button labels
  function updateSiteStatus(isEnabled, whitelist, blacklist) {
    if (!currentDomain) {
      siteStatusEl.className = 'status-indicator';
      siteStatusEl.innerHTML = '<span class="indicator-dot"></span>N/A';
      return;
    }

    const isWhitelisted = whitelist.some(item => currentDomain === item || currentDomain.endsWith('.' + item));
    const isBlacklisted = blacklist.some(item => currentDomain === item || currentDomain.endsWith('.' + item));

    if (isWhitelisted) {
      siteStatusEl.className = 'status-indicator whitelisted';
      siteStatusEl.innerHTML = '<span class="indicator-dot"></span>Whitelisted';
      
      whitelistBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        Whitelisted
      `;
      whitelistBtn.classList.remove('outline');
      
      // Clear conflicting actions
      blacklistBtn.classList.add('outline');
      blacklistBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        Blacklist Site
      `;
    } else if (isBlacklisted) {
      siteStatusEl.className = 'status-indicator blacklisted';
      siteStatusEl.innerHTML = '<span class="indicator-dot"></span>Blacklisted';
      
      blacklistBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        Blacklisted
      `;
      blacklistBtn.classList.remove('outline');
      
      whitelistBtn.classList.add('outline');
      whitelistBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        Whitelist Site
      `;
    } else if (!isEnabled) {
      siteStatusEl.className = 'status-indicator';
      siteStatusEl.innerHTML = '<span class="indicator-dot"></span>Unprotected';
      resetButtonStates();
    } else {
      siteStatusEl.className = 'status-indicator protected';
      siteStatusEl.innerHTML = '<span class="indicator-dot"></span>Protected';
      resetButtonStates();
    }
  }

  function resetButtonStates() {
    whitelistBtn.classList.add('outline');
    whitelistBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      Whitelist Site
    `;

    blacklistBtn.classList.add('outline');
    blacklistBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
      Blacklist Site
    `;
  }

  // Animates numerical numbers with a pleasant glow pulse
  function animateCounter(element, newValue) {
    const oldValue = parseInt(element.textContent || '0', 10);
    if (oldValue === newValue) return;

    element.textContent = newValue;
    element.classList.remove('pulse');
    void element.offsetWidth; // Trigger reflow to restart animation
    element.classList.add('pulse');
  }

  // Toggle Global Shield Status
  powerToggleBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'REDIRECT_SHIELD_TOGGLE_STATE' }, (response) => {
      if (response) {
        updateUI();
      }
    });
  });

  // Whitelist website toggle handler
  whitelistBtn.addEventListener('click', () => {
    if (!currentDomain) return;

    chrome.storage.local.get(['whitelist', 'blacklist'], (result) => {
      let whitelist = result.whitelist || [];
      let blacklist = result.blacklist || [];

      const idx = whitelist.indexOf(currentDomain);
      if (idx > -1) {
        whitelist.splice(idx, 1); // Remove
      } else {
        whitelist.push(currentDomain); // Add
        // Clear conflicting blacklist
        const bIdx = blacklist.indexOf(currentDomain);
        if (bIdx > -1) blacklist.splice(bIdx, 1);
      }

      chrome.storage.local.set({ whitelist, blacklist }, () => {
        updateUI();
        reloadActiveTab();
      });
    });
  });

  // Blacklist website toggle handler
  blacklistBtn.addEventListener('click', () => {
    if (!currentDomain) return;

    chrome.storage.local.get(['whitelist', 'blacklist'], (result) => {
      let whitelist = result.whitelist || [];
      let blacklist = result.blacklist || [];

      const idx = blacklist.indexOf(currentDomain);
      if (idx > -1) {
        blacklist.splice(idx, 1); // Remove
      } else {
        blacklist.push(currentDomain); // Add
        // Clear conflicting whitelist
        const wIdx = whitelist.indexOf(currentDomain);
        if (wIdx > -1) whitelist.splice(wIdx, 1);
      }

      chrome.storage.local.set({ whitelist, blacklist }, () => {
        updateUI();
        reloadActiveTab();
      });
    });
  });

  // Reload current active tab to immediately enforce modifications
  async function reloadActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].id) {
      chrome.tabs.reload(tabs[0].id);
    }
  }

  // Reset counters logic
  resetStatsBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all blocked event history and counts?')) {
      const resetStats = {
        total: { redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
        daily: { date: '', redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
        weekly: { startOfWeek: '', redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
        monthly: { startOfMonth: '', redirects: 0, popups: 0, overlays: 0, windows: 0, total: 0 },
        topDomains: {}
      };
      
      chrome.storage.local.set({ stats: resetStats }, () => {
        updateUI();
      });
    }
  });

  // Open Options page / settings dashboard
  function openOptions() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  }

  openSettingsBtn.addEventListener('click', openOptions);
  dashboardBtn.addEventListener('click', openOptions);

  // Listen for background-broadcasted updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'REDIRECT_SHIELD_STATS_UPDATED') {
      updateUI();
    }
  });

  // Run initializer
  init();
});
