/**
 * Redirect Shield AI - Popup Logic Controller
 * Manages active tab domain ratings, theme adjustments, power switch state,
 * whitelisting/blacklisting controls, and real-time statistics sync.
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM References
  const powerSection = document.querySelector('.power-section');
  const powerToggleBtn = document.getElementById('power-toggle-btn');
  const statusLabel = document.getElementById('protection-status-label');
  const levelBadge = document.getElementById('protection-level-badge');

  const currentDomainEl = document.getElementById('current-domain');
  const siteReputationEl = document.getElementById('site-reputation');
  const whitelistBtn = document.getElementById('whitelist-site-btn');
  const blacklistBtn = document.getElementById('blacklist-site-btn');
  const siteLevelSelect = document.getElementById('site-level-select');

  const statTodayEl = document.getElementById('stat-today');
  const statTotalEl = document.getElementById('stat-total');
  const statPopupsEl = document.getElementById('stat-popups');
  const statRedirectsEl = document.getElementById('stat-redirects');
  const statOverlaysEl = document.getElementById('stat-overlays');
  const statDeceptiveEl = document.getElementById('stat-deceptive');

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const sunIcon = themeToggleBtn.querySelector('.sun-icon');
  const moonIcon = themeToggleBtn.querySelector('.moon-icon');

  const resetStatsBtn = document.getElementById('reset-stats-btn');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const openSettingsBtn = document.getElementById('open-settings-btn');

  const storage = RedirectShieldStorage;
  const detector = RedirectShieldDetector;
  const helpers = RedirectShieldHelpers;

  // New Interactive DOM References
  const zapOverlaysBtn = document.getElementById('zap-overlays-btn');
  const activityCard = document.getElementById('activity-card');
  const activityLogList = document.getElementById('activity-log-list');

  const chkPopups = document.getElementById('chk-popups');
  const chkRedirects = document.getElementById('chk-redirects');
  const chkOverlays = document.getElementById('chk-overlays');
  const chkDeceptive = document.getElementById('chk-deceptive');

  let currentDomain = '';
  let activeTabId = null;
  let appSettings = {};

  /**
   * Initializes the popup panel context
   */
  async function init() {
    // 1. Resolve current active tab domain details
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      
      if (activeTab && activeTab.url) {
        activeTabId = activeTab.id;
        const url = new URL(activeTab.url);
        if (url.protocol.startsWith('http')) {
          currentDomain = url.hostname.toLowerCase();
          currentDomainEl.textContent = currentDomain;

          // Fetch tab block logs from background cache
          chrome.runtime.sendMessage({
            type: 'REDIRECT_SHIELD_GET_TAB_LOGS',
            tabId: activeTabId
          }, (logs) => {
            renderActivityLogs(logs);
          });
        } else {
          setSystemPageMode();
        }
      } else {
        setUnknownPageMode();
      }
    } catch (err) {
      setUnknownPageMode();
    }

    // 2. Fetch and render configurations
    await loadConfigAndRender();
  }

  function setSystemPageMode() {
    currentDomain = '';
    currentDomainEl.textContent = 'System Page';
    whitelistBtn.disabled = true;
    blacklistBtn.disabled = true;
    siteLevelSelect.disabled = true;
    siteLevelSelect.value = 'default';
  }

  function setUnknownPageMode() {
    currentDomain = '';
    currentDomainEl.textContent = 'Internal Webpage';
    whitelistBtn.disabled = true;
    blacklistBtn.disabled = true;
    siteLevelSelect.disabled = true;
    siteLevelSelect.value = 'default';
  }

  /**
   * Loads configurations from storage and updates DOM indicators
   */
  async function loadConfigAndRender() {
    appSettings = await storage.getSettings();

    // 1. Apply global theme settings
    applyTheme(appSettings.theme || 'dark');

    // 2. Toggle active power state
    const isEnabled = appSettings.enabled !== false;
    if (isEnabled) {
      powerSection.classList.add('active');
      statusLabel.textContent = 'Shield Active';
    } else {
      powerSection.classList.remove('active');
      statusLabel.textContent = 'Shield Disabled';
    }

    // 3. Render Mode Badge
    const levelNames = {
      basic: 'Basic Level',
      balanced: 'Balanced Mode',
      advanced: 'Advanced protection',
      maximum: 'Maximum Shield'
    };
    levelBadge.textContent = levelNames[appSettings.protectionLevel] || 'Balanced Mode';

    // 4. Update Site-Specific Reputation and List Actions
    updateSiteMetadata(isEnabled);

    // 5. Update Block Counters
    const stats = appSettings.stats || {};
    const total = stats.total || { popups: 0, redirects: 0, overlays: 0, deceptive: 0, total: 0 };
    const daily = stats.daily || { total: 0 };

    animateCounter(statTodayEl, daily.total || 0);
    animateCounter(statTotalEl, total.total || 0);
    animateCounter(statPopupsEl, total.popups || 0);
    animateCounter(statRedirectsEl, total.redirects || 0);
    animateCounter(statOverlaysEl, total.overlays || 0);
    animateCounter(statDeceptiveEl, total.deceptive || 0);

    // Update active rules checklist UI
    updateChecklists();
  }

  /**
   * Refreshes active protection checklists based on current shield level settings
   */
  function updateChecklists() {
    const isEnabled = appSettings.enabled !== false;
    const level = appSettings.protectionLevel || 'balanced';

    // Whitelisted site blocks nothing
    const isWhitelisted = currentDomain && (appSettings.whitelist || []).includes(currentDomain);
    const active = isEnabled && !isWhitelisted;

    const popupsActive = active;
    const redirectsActive = active && level !== 'basic';
    const overlaysActive = active && level !== 'basic' && appSettings.autoRemoveOverlays !== false;
    const deceptiveActive = active && appSettings.detectFakeDownloads !== false;

    const toggleItem = (el, isActive) => {
      if (!el) return;
      if (isActive) el.classList.add('active');
      else el.classList.remove('active');
    };

    toggleItem(chkPopups, popupsActive);
    toggleItem(chkRedirects, redirectsActive);
    toggleItem(chkOverlays, overlaysActive);
    toggleItem(chkDeceptive, deceptiveActive);
  }

  /**
   * Applies the theme styles (dark/light) to the document
   */
  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      document.documentElement.classList.remove('light-theme');
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }
  }

  /**
   * Renders local reputation ratings and whitelists/blacklists outline states
   */
  function updateSiteMetadata(isEnabled) {
    if (!currentDomain) {
      siteReputationEl.className = 'status-indicator';
      siteReputationEl.innerHTML = '<span class="indicator-dot"></span>N/A';
      siteLevelSelect.disabled = true;
      siteLevelSelect.value = 'default';
      return;
    }

    siteLevelSelect.disabled = !isEnabled;
    const customLevels = appSettings.customLevels || {};
    if (customLevels[currentDomain]) {
      siteLevelSelect.value = customLevels[currentDomain];
    } else {
      siteLevelSelect.value = 'default';
    }

    // Determine domain list memberships
    const whitelist = appSettings.whitelist || [];
    const blacklist = appSettings.blacklist || [];
    const isWhitelisted = whitelist.includes(currentDomain) || whitelist.some(d => currentDomain.endsWith('.' + d));
    const isBlacklisted = blacklist.includes(currentDomain) || blacklist.some(d => currentDomain.endsWith('.' + d));

    // Resolve domain safety rating
    const rating = detector.assessDomainReputation(appSettings, currentDomain);

    if (isWhitelisted) {
      siteReputationEl.className = 'status-indicator whitelisted';
      siteReputationEl.innerHTML = '<span class="indicator-dot"></span>Whitelisted';
      
      // Update Whitelist button active state
      whitelistBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        Whitelisted
      `;
      whitelistBtn.classList.remove('outline');

      // Clear Blacklist button states
      resetBlacklistButton();
    } else if (isBlacklisted) {
      siteReputationEl.className = 'status-indicator blacklisted';
      siteReputationEl.innerHTML = '<span class="indicator-dot"></span>Blacklisted';

      blacklistBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        Blacklisted
      `;
      blacklistBtn.classList.remove('outline');

      resetWhitelistButton();
    } else {
      // Apply reputation grade colors
      if (rating === 'safe') {
        siteReputationEl.className = 'status-indicator protected';
        siteReputationEl.innerHTML = '<span class="indicator-dot"></span>Safe Domain';
      } else if (rating === 'warning') {
        siteReputationEl.className = 'status-indicator whitelisted';
        siteReputationEl.innerHTML = '<span class="indicator-dot"></span>Warning Grade';
      } else {
        siteReputationEl.className = 'status-indicator blacklisted';
        siteReputationEl.innerHTML = '<span class="indicator-dot"></span>Suspicious Site';
      }

      resetWhitelistButton();
      resetBlacklistButton();
    }
  }

  function resetWhitelistButton() {
    whitelistBtn.classList.add('outline');
    whitelistBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      Whitelist Site
    `;
  }

  function resetBlacklistButton() {
    blacklistBtn.classList.add('outline');
    blacklistBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
      Blacklist Site
    `;
  }

  /**
   * Smoothly transitions counts updating with a visual scale pulse
   */
  function animateCounter(element, newValue) {
    const oldValue = parseInt(element.textContent || '0', 10);
    if (oldValue === newValue) return;

    element.textContent = newValue;
    element.classList.remove('pulse');
    void element.offsetWidth; // Reflow reset trigger
    element.classList.add('pulse');
  }

  // Toggle power state
  powerToggleBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'REDIRECT_SHIELD_TOGGLE_STATE' }, (response) => {
      if (response) {
        loadConfigAndRender();
      }
    });
  });

  // Whitelist button click trigger
  whitelistBtn.addEventListener('click', async () => {
    if (!currentDomain) return;

    const whitelist = appSettings.whitelist || [];
    const blacklist = appSettings.blacklist || [];
    
    const idx = whitelist.indexOf(currentDomain);
    if (idx > -1) {
      whitelist.splice(idx, 1);
    } else {
      whitelist.push(currentDomain);
      // Remove conflicts from opposite list
      const bIdx = blacklist.indexOf(currentDomain);
      if (bIdx > -1) blacklist.splice(bIdx, 1);
    }

    await storage.set({ whitelist, blacklist });
    await loadConfigAndRender();
    notifyCurrentTabOfChange();
  });

  // Blacklist button click trigger
  blacklistBtn.addEventListener('click', async () => {
    if (!currentDomain) return;

    const whitelist = appSettings.whitelist || [];
    const blacklist = appSettings.blacklist || [];

    const idx = blacklist.indexOf(currentDomain);
    if (idx > -1) {
      blacklist.splice(idx, 1);
    } else {
      blacklist.push(currentDomain);
      // Remove conflicts from opposite list
      const wIdx = whitelist.indexOf(currentDomain);
      if (wIdx > -1) whitelist.splice(wIdx, 1);
    }

    await storage.set({ whitelist, blacklist });
    await loadConfigAndRender();
    notifyCurrentTabOfChange();
  });

  /**
   * Reload current active tab to immediately enforce modifications
   */
  async function notifyCurrentTabOfChange() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'REDIRECT_SHIELD_STATE_CHANGED' }).catch(() => {});
        chrome.tabs.reload(tabs[0].id);
      }
    } catch (e) {
      // Ignore reload exceptions
    }
  }

  // Theme toggler click trigger
  themeToggleBtn.addEventListener('click', async () => {
    const isLight = document.documentElement.classList.contains('light-theme');
    const newTheme = isLight ? 'dark' : 'light';
    await storage.set({ theme: newTheme });
    applyTheme(newTheme);
  });

  // Site-specific protection level dropdown change handler
  siteLevelSelect.addEventListener('change', async () => {
    if (!currentDomain) return;

    const customLevels = appSettings.customLevels || {};
    const selectedLevel = siteLevelSelect.value;

    if (selectedLevel === 'default') {
      delete customLevels[currentDomain];
    } else {
      customLevels[currentDomain] = selectedLevel;
    }

    await storage.set({ customLevels });
    await loadConfigAndRender();
    notifyCurrentTabOfChange();
  });

  // Reset stats triggers
  resetStatsBtn.addEventListener('click', async () => {
    const confirmReset = confirm('Are you sure you want to reset all blocked event history and counts?');
    if (confirmReset) {
      await storage.resetStats();
      await loadConfigAndRender();
    }
  });

  // Navigation dashboard shortcuts
  function openDashboard() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  }

  dashboardBtn.addEventListener('click', openDashboard);
  openSettingsBtn.addEventListener('click', openDashboard);

  // Sync metrics dynamic increments on message logs
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'REDIRECT_SHIELD_STATS_UPDATED') {
      loadConfigAndRender();
      if (message.tabId === activeTabId && message.tabLogs) {
        renderActivityLogs(message.tabLogs);
      }
    }
  });

  // Manual Zap Overlays listener
  zapOverlaysBtn.addEventListener('click', () => {
    if (!activeTabId) return;

    try {
      chrome.tabs.sendMessage(activeTabId, { type: 'REDIRECT_SHIELD_MANUAL_ZAP' }, (response) => {
        const iconSvg = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        `;
        if (response && response.success) {
          const removedText = response.removed ? 'Cleaned Overlays' : 'Clean Page';
          zapOverlaysBtn.innerHTML = `${iconSvg} Swept! ${removedText}`;
          zapOverlaysBtn.style.color = 'var(--safe-color)';
          zapOverlaysBtn.style.borderColor = 'var(--safe-color)';

          // Query logs update
          chrome.runtime.sendMessage({
            type: 'REDIRECT_SHIELD_GET_TAB_LOGS',
            tabId: activeTabId
          }, (logs) => {
            renderActivityLogs(logs);
          });

          setTimeout(() => {
            zapOverlaysBtn.innerHTML = `${iconSvg} Zap Overlays Manually`;
            zapOverlaysBtn.style.color = '';
            zapOverlaysBtn.style.borderColor = '';
          }, 1500);
        } else {
          zapOverlaysBtn.innerHTML = `${iconSvg} Zap Failed`;
          zapOverlaysBtn.style.color = 'var(--danger-color)';
          zapOverlaysBtn.style.borderColor = 'var(--danger-color)';
          setTimeout(() => {
            zapOverlaysBtn.innerHTML = `${iconSvg} Zap Overlays Manually`;
            zapOverlaysBtn.style.color = '';
            zapOverlaysBtn.style.borderColor = '';
          }, 1500);
        }
      });
    } catch (e) {
      console.error(e);
    }
  });

  /**
   * Renders the tab activity logs list
   */
  function renderActivityLogs(logs) {
    if (!logs || logs.length === 0) {
      activityCard.style.display = 'none';
      return;
    }

    activityCard.style.display = 'block';
    activityLogList.innerHTML = '';

    const typeTextMap = {
      popup: 'Popup',
      redirect: 'Redirect',
      overlay: 'Overlay',
      deceptive: 'Deceptive'
    };

    // Render last 3 logs
    logs.slice(0, 3).forEach(log => {
      const item = document.createElement('div');
      item.className = 'activity-item';

      const typeLabel = typeTextMap[log.type] || log.type;
      const urlText = log.url || 'Overlay removed';

      item.innerHTML = `
        <div class="activity-item-info">
          <div class="activity-item-url" title="${urlText}">${urlText}</div>
          <div class="activity-item-meta">
            <span class="activity-item-badge badge-${log.type}">${typeLabel}</span>
          </div>
        </div>
        <div class="activity-item-time">${log.time || ''}</div>
      `;
      activityLogList.appendChild(item);
    });
  }

  // Launch initial checks
  init();
});
