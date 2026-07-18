/**
 * Redirect Shield AI - Options Dashboard logic Controller
 * Coordinates tab views, level settings, whitelists/blacklists manager,
 * horizontal progress charts, diagnostic toggles, and data migration utilities.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Navigation elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // Protection Level elements
  const levelCards = document.querySelectorAll('.level-card');
  const summaryActiveStatus = document.getElementById('summary-active-status');
  const summaryActiveLevel = document.getElementById('summary-active-level');

  // Whitelist / Blacklist inputs
  const whitelistInput = document.getElementById('whitelist-input');
  const addWhitelistBtn = document.getElementById('add-whitelist-btn');
  const whitelistSearch = document.getElementById('whitelist-search');
  const whitelistList = document.getElementById('whitelist-list');

  const blacklistInput = document.getElementById('blacklist-input');
  const addBlacklistBtn = document.getElementById('add-blacklist-btn');
  const blacklistSearch = document.getElementById('blacklist-search');
  const blacklistList = document.getElementById('blacklist-list');

  // Custom Level elements
  const customLevelInput = document.getElementById('custom-level-input');
  const customLevelSelect = document.getElementById('custom-level-select');
  const addCustomLevelBtn = document.getElementById('add-custom-level-btn');
  const customLevelSearch = document.getElementById('custom-level-search');
  const customLevelList = document.getElementById('custom-level-list');

  // Statistics counters
  const statsTotalAll = document.getElementById('stats-total-all');
  const statsTodayAll = document.getElementById('stats-today-all');
  const statsWeeklyAll = document.getElementById('stats-weekly-all');
  const statsMonthlyAll = document.getElementById('stats-monthly-all');

  const barValPopups = document.getElementById('bar-val-popups');
  const barValRedirects = document.getElementById('bar-val-redirects');
  const barValOverlays = document.getElementById('bar-val-overlays');
  const barValDeceptive = document.getElementById('bar-val-deceptive');

  const progressPopups = document.getElementById('progress-bar-popups');
  const progressRedirects = document.getElementById('progress-bar-redirects');
  const progressOverlays = document.getElementById('progress-bar-overlays');
  const progressDeceptive = document.getElementById('progress-bar-deceptive');

  const topDomainsContainer = document.getElementById('top-domains-container');

  // Diagnostic switches
  const prefShowToasts = document.getElementById('pref-show-toasts');
  const prefConsoleLogging = document.getElementById('pref-console-logging');
  const prefRemoveOverlays = document.getElementById('pref-remove-overlays');
  const prefDetectDeceptive = document.getElementById('pref-detect-deceptive');

  // Backups / reset buttons
  const exportBtn = document.getElementById('export-settings-btn');
  const importTrigger = document.getElementById('import-settings-trigger');
  const importFile = document.getElementById('import-settings-file');
  const factoryResetBtn = document.getElementById('reset-all-settings-btn');

  const themeBtns = document.querySelectorAll('.theme-btn');

  const storage = RedirectShieldStorage;
  let appState = {};

  // 1. Sidebar tab switching
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      
      navItems.forEach(n => n.classList.remove('active'));
      btn.classList.add('active');

      tabPanels.forEach(panel => {
        if (panel.id === targetId) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });

  // 2. Fetch and render settings on page load
  async function loadSettings() {
    appState = await storage.getSettings();

    // Enforce Theme
    applyTheme(appState.theme || 'dark');

    // Update active level indicator card
    const activeLevel = appState.protectionLevel || 'balanced';
    levelCards.forEach(card => {
      if (card.getAttribute('data-level') === activeLevel) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Update status summary text
    const isEnabled = appState.enabled !== false;
    if (isEnabled) {
      summaryActiveStatus.textContent = 'ON';
      summaryActiveStatus.className = 'status-green';
    } else {
      summaryActiveStatus.textContent = 'OFF';
      summaryActiveStatus.className = '';
    }

    const levelNames = {
      basic: 'Basic Protection Level',
      balanced: 'Balanced Mode (Recommended)',
      advanced: 'Advanced Shielding level',
      maximum: 'Strict Maximum Shield'
    };
    summaryActiveLevel.textContent = levelNames[activeLevel] || activeLevel;

    // Render Whitelist & Blacklist domains
    renderDomainList('whitelist');
    renderDomainList('blacklist');
    renderCustomLevels();

    // Populate Analytics numbers
    const stats = appState.stats || {};
    const totalStats = stats.total || { total: 0, popups: 0, redirects: 0, overlays: 0, deceptive: 0 };
    const dailyStats = stats.daily || { total: 0 };
    const weeklyStats = stats.weekly || { total: 0 };
    const monthlyStats = stats.monthly || { total: 0 };

    statsTotalAll.textContent = totalStats.total || 0;
    statsTodayAll.textContent = dailyStats.total || 0;
    statsWeeklyAll.textContent = weeklyStats.total || 0;
    statsMonthlyAll.textContent = monthlyStats.total || 0;

    barValPopups.textContent = totalStats.popups || 0;
    barValRedirects.textContent = totalStats.redirects || 0;
    barValOverlays.textContent = totalStats.overlays || 0;
    barValDeceptive.textContent = totalStats.deceptive || 0;

    // Category percentage bar animations
    const maxVal = Math.max(
      totalStats.popups || 0,
      totalStats.redirects || 0,
      totalStats.overlays || 0,
      totalStats.deceptive || 0,
      1 // Prevent dividing by zero
    );

    progressPopups.style.width = '0%';
    progressRedirects.style.width = '0%';
    progressOverlays.style.width = '0%';
    progressDeceptive.style.width = '0%';

    setTimeout(() => {
      progressPopups.style.width = `${((totalStats.popups || 0) / maxVal) * 100}%`;
      progressRedirects.style.width = `${((totalStats.redirects || 0) / maxVal) * 100}%`;
      progressOverlays.style.width = `${((totalStats.overlays || 0) / maxVal) * 100}%`;
      progressDeceptive.style.width = `${((totalStats.deceptive || 0) / maxVal) * 100}%`;
    }, 100);

    // Render top domains bar chart
    renderTopDomains(stats.topDomains || {});

    // Sync Toggle Switch values
    prefShowToasts.checked = appState.showToasts !== false;
    prefConsoleLogging.checked = appState.consoleLogging !== false;
    prefRemoveOverlays.checked = appState.autoRemoveOverlays !== false;
    prefDetectDeceptive.checked = appState.detectFakeDownloads !== false;
  }

  /**
   * Applies the theme styles (dark/light) to the options page
   */
  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
    themeBtns.forEach(btn => {
      if (btn.getAttribute('data-theme') === theme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Theme switch button triggers
  themeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = btn.getAttribute('data-theme');
      await storage.set({ theme });
      applyTheme(theme);
    });
  });

  // 3. Selection of Protection Levels card
  levelCards.forEach(card => {
    card.addEventListener('click', async () => {
      const selectedLevel = card.getAttribute('data-level');
      await storage.set({ protectionLevel: selectedLevel });
      notifyTabsOfChange();
      await loadSettings();
    });
  });

  // 4. Domain Whitelist / Blacklist modifiers
  addWhitelistBtn.addEventListener('click', () => addDomain('whitelist'));
  whitelistInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addDomain('whitelist'); });
  whitelistSearch.addEventListener('input', () => renderDomainList('whitelist'));

  addBlacklistBtn.addEventListener('click', () => addDomain('blacklist'));
  blacklistInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addDomain('blacklist'); });
  blacklistSearch.addEventListener('input', () => renderDomainList('blacklist'));

  addCustomLevelBtn.addEventListener('click', addCustomRule);
  customLevelInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addCustomRule(); });
  customLevelSearch.addEventListener('input', renderCustomLevels);

  async function addDomain(type) {
    const inputEl = type === 'whitelist' ? whitelistInput : blacklistInput;
    let domainStr = inputEl.value.trim().toLowerCase();

    if (!domainStr) return;

    // Normalizes URLs input to hostname domains
    try {
      if (domainStr.includes('://')) {
        domainStr = new URL(domainStr).hostname;
      } else {
        domainStr = new URL('http://' + domainStr).hostname;
      }
    } catch (e) {
      alert('Invalid domain format entered. Please enter a valid host name like site.com.');
      return;
    }

    if (globalScope.RedirectShieldHelpers && !globalScope.RedirectShieldHelpers.isValidDomain(domainStr)) {
      alert('Invalid domain format. Domain must contain a valid TLD extension (e.g. site.com).');
      return;
    }

    const currentList = appState[type] || [];
    if (currentList.includes(domainStr)) {
      alert('This domain already exists on this list.');
      return;
    }

    currentList.push(domainStr);

    // Remove domains from opposite lists to avoid configuration conflicts
    const oppositeType = type === 'whitelist' ? 'blacklist' : 'whitelist';
    const oppositeList = appState[oppositeType] || [];
    const conflictIdx = oppositeList.indexOf(domainStr);
    if (conflictIdx > -1) oppositeList.splice(conflictIdx, 1);

    await storage.set({
      [type]: currentList,
      [oppositeType]: oppositeList
    });

    inputEl.value = '';
    notifyTabsOfChange();
    await loadSettings();
  }

  async function deleteDomain(type, domain) {
    const list = appState[type] || [];
    const idx = list.indexOf(domain);
    if (idx > -1) {
      list.splice(idx, 1);
      await storage.set({ [type]: list });
      notifyTabsOfChange();
      await loadSettings();
    }
  }

  function renderDomainList(type) {
    const listEl = type === 'whitelist' ? whitelistList : blacklistList;
    const searchEl = type === 'whitelist' ? whitelistSearch : blacklistSearch;
    const items = appState[type] || [];
    const searchQuery = searchEl.value.trim().toLowerCase();

    const badgeEl = document.getElementById(`${type}-count`);
    if (badgeEl) badgeEl.textContent = items.length;

    listEl.innerHTML = '';

    const filtered = items.filter(domain => domain.includes(searchQuery));
    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="domain-item"><span style="color: var(--text-muted-dark); font-style: italic;">No domains found.</span></li>`;
      return;
    }

    filtered.sort().forEach(domain => {
      const li = document.createElement('li');
      li.className = 'domain-item';

      const span = document.createElement('span');
      span.textContent = domain;
      span.title = domain;

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.title = 'Remove domain';
      delBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      `;

      delBtn.addEventListener('click', () => deleteDomain(type, domain));

      li.appendChild(span);
      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  }

  async function addCustomRule() {
    let domainStr = customLevelInput.value.trim().toLowerCase();
    if (!domainStr) return;

    try {
      if (domainStr.includes('://')) {
        domainStr = new URL(domainStr).hostname;
      } else {
        domainStr = new URL('http://' + domainStr).hostname;
      }
    } catch (e) {
      alert('Invalid domain format entered. Please enter a valid host name like site.com.');
      return;
    }

    if (globalScope.RedirectShieldHelpers && !globalScope.RedirectShieldHelpers.isValidDomain(domainStr)) {
      alert('Invalid domain format. Domain must contain a valid TLD extension (e.g. site.com).');
      return;
    }

    const customLevels = appState.customLevels || {};
    const selectedLevel = customLevelSelect.value || 'balanced';

    // Remove from whitelist/blacklist to avoid rules collision
    const whitelist = appState.whitelist || [];
    const blacklist = appState.blacklist || [];
    
    const wIdx = whitelist.indexOf(domainStr);
    if (wIdx > -1) whitelist.splice(wIdx, 1);
    
    const bIdx = blacklist.indexOf(domainStr);
    if (bIdx > -1) blacklist.splice(bIdx, 1);

    customLevels[domainStr] = selectedLevel;

    await storage.set({
      customLevels,
      whitelist,
      blacklist
    });

    customLevelInput.value = '';
    notifyTabsOfChange();
    await loadSettings();
  }

  function renderCustomLevels() {
    const listEl = customLevelList;
    const searchEl = customLevelSearch;
    const items = appState.customLevels || {};
    const searchQuery = searchEl.value.trim().toLowerCase();

    const badgeEl = document.getElementById('custom-count');
    if (badgeEl) badgeEl.textContent = Object.keys(items).length;

    listEl.innerHTML = '';

    const filtered = Object.entries(items).filter(([domain]) => domain.includes(searchQuery));
    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="domain-item"><span style="color: var(--text-muted-dark); font-style: italic;">No domains found.</span></li>`;
      return;
    }

    filtered.sort((a, b) => a[0].localeCompare(b[0])).forEach(([domain, level]) => {
      const li = document.createElement('li');
      li.className = 'domain-item';

      const span = document.createElement('span');
      // Format level text with a colored tag matching active protection themes
      const badgeColor = level === 'maximum' ? 'var(--danger-gradient)' : level === 'advanced' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.15)';
      const badgeTextCol = level === 'maximum' || level === 'advanced' ? '#000000' : 'var(--text-main)';
      span.innerHTML = `${domain} <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: ${badgeColor}; color: ${badgeTextCol}; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${level}</span>`;
      span.title = `${domain} (${level})`;

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.title = 'Remove rule';
      delBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      `;

      delBtn.addEventListener('click', async () => {
        delete items[domain];
        await storage.set({ customLevels: items });
        notifyTabsOfChange();
        await loadSettings();
      });

      li.appendChild(span);
      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  }

  function renderTopDomains(topDomains) {
    topDomainsContainer.innerHTML = '';
    const entries = Object.entries(topDomains);

    if (entries.length === 0) {
      topDomainsContainer.innerHTML = `<p class="no-data">Safe browsing! No targets recorded yet.</p>`;
      return;
    }

    const maxBlocks = Math.max(...entries.map(e => e[1]), 1);

    entries.forEach(([domain, count]) => {
      const row = document.createElement('div');
      row.className = 'chart-bar-row';
      const percent = (count / maxBlocks) * 100;

      row.innerHTML = `
        <div class="chart-bar-info">
          <span>${domain}</span>
          <strong>${count}</strong>
        </div>
        <div class="chart-progress-outer">
          <div class="chart-progress-inner" style="width: 0%"></div>
        </div>
      `;
      topDomainsContainer.appendChild(row);

      setTimeout(() => {
        const inner = row.querySelector('.chart-progress-inner');
        if (inner) inner.style.width = `${percent}%`;
      }, 50);
    });
  }

  function notifyTabsOfChange() {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'REDIRECT_SHIELD_STATE_CHANGED' }).catch(() => {});
      });
    });
  }

  // 5. Diagnostic switches click triggers
  prefShowToasts.addEventListener('change', async () => {
    await storage.set({ showToasts: prefShowToasts.checked });
  });

  prefConsoleLogging.addEventListener('change', async () => {
    await storage.set({ consoleLogging: prefConsoleLogging.checked });
  });

  prefRemoveOverlays.addEventListener('change', async () => {
    await storage.set({ autoRemoveOverlays: prefRemoveOverlays.checked });
  });

  prefDetectDeceptive.addEventListener('change', async () => {
    await storage.set({ detectFakeDownloads: prefDetectDeceptive.checked });
  });

  // 6. Config backups Import & Export
  exportBtn.addEventListener('click', async () => {
    const data = await storage.get(null);
    const backup = {
      enabled: data.enabled !== false,
      protectionLevel: data.protectionLevel || 'balanced',
      whitelist: data.whitelist || [],
      blacklist: data.blacklist || [],
      customLevels: data.customLevels || {},
      showToasts: data.showToasts !== false,
      consoleLogging: data.consoleLogging !== false,
      autoRemoveOverlays: data.autoRemoveOverlays !== false,
      detectFakeDownloads: data.detectFakeDownloads !== false,
      theme: data.theme || 'dark',
      stats: data.stats || {}
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `redirect_shield_ai_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  });

  importTrigger.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.whitelist !== undefined && parsed.blacklist !== undefined && parsed.protectionLevel !== undefined) {
          await storage.set(parsed);
          alert('Configuration imported successfully!');
          notifyTabsOfChange();
          await loadSettings();
        } else {
          alert('Failed to import: Invalid configuration schema layout.');
        }
      } catch (err) {
        alert('Failed to read configuration: File contains invalid JSON structures.');
      }
    };
    reader.readAsText(file);
  });

  factoryResetBtn.addEventListener('click', () => {
    const isConfirmed = confirm('WARNING: You are about to Factory Reset the extension. This wipes settings, statistics, and domain lists. Proceed?');
    if (isConfirmed) {
      chrome.storage.local.clear(async () => {
        chrome.runtime.reload();
      });
    }
  });

  // Sync stats when background records blocks
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'REDIRECT_SHIELD_STATS_UPDATED') {
      loadSettings();
    }
  });

  // Run initial queries
  loadSettings();
});
