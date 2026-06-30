/**
 * Redirect Shield - Dashboard Options page
 * Manages tab navigations, protection levels selection, whitelist/blacklist managers,
 * custom analytical bar rendering, preference toggles, settings backups.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // Config elements
  const levelCards = document.querySelectorAll('.level-card');
  const summaryActiveStatus = document.getElementById('summary-active-status');
  const summaryActiveLevel = document.getElementById('summary-active-level');

  // Whitelist / Blacklist elements
  const whitelistInput = document.getElementById('whitelist-input');
  const addWhitelistBtn = document.getElementById('add-whitelist-btn');
  const whitelistSearch = document.getElementById('whitelist-search');
  const whitelistList = document.getElementById('whitelist-list');

  const blacklistInput = document.getElementById('blacklist-input');
  const addBlacklistBtn = document.getElementById('add-blacklist-btn');
  const blacklistSearch = document.getElementById('blacklist-search');
  const blacklistList = document.getElementById('blacklist-list');

  // Analytics elements
  const statsTotalAll = document.getElementById('stats-total-all');
  const statsTodayAll = document.getElementById('stats-today-all');
  const statsWeeklyAll = document.getElementById('stats-weekly-all');
  const statsMonthlyAll = document.getElementById('stats-monthly-all');
  
  const barValPopups = document.getElementById('bar-val-popups');
  const barValRedirects = document.getElementById('bar-val-redirects');
  const barValOverlays = document.getElementById('bar-val-overlays');
  const barValWindows = document.getElementById('bar-val-windows');
  
  const progressPopups = document.getElementById('progress-bar-popups');
  const progressRedirects = document.getElementById('progress-bar-redirects');
  const progressOverlays = document.getElementById('progress-bar-overlays');
  const progressWindows = document.getElementById('progress-bar-windows');
  
  const topDomainsContainer = document.getElementById('top-domains-container');

  // Preference elements
  const prefShowToasts = document.getElementById('pref-show-toasts');
  const prefConsoleLogging = document.getElementById('pref-console-logging');
  const prefRemoveOverlays = document.getElementById('pref-remove-overlays');
  
  const exportBtn = document.getElementById('export-settings-btn');
  const importTrigger = document.getElementById('import-settings-trigger');
  const importFile = document.getElementById('import-settings-file');
  const factoryResetBtn = document.getElementById('reset-all-settings-btn');

  // State variables
  let appState = {
    whitelist: [],
    blacklist: [],
    stats: {}
  };

  // 1. Sidebar tab switching
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      
      // Update buttons
      navItems.forEach(n => n.classList.remove('active'));
      btn.classList.add('active');

      // Update panels
      tabPanels.forEach(panel => {
        if (panel.id === targetId) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });

  // 2. Fetch and render state on load
  function loadSettings() {
    chrome.storage.local.get(null, (result) => {
      appState = result;
      
      // Update protection level UI selection
      const activeLevel = result.protectionLevel || 'high';
      levelCards.forEach(card => {
        if (card.getAttribute('data-level') === activeLevel) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });

      // Update status summary section
      const isEnabled = result.enabled !== false;
      if (isEnabled) {
        summaryActiveStatus.textContent = 'ON';
        summaryActiveStatus.className = 'status-green';
      } else {
        summaryActiveStatus.textContent = 'OFF';
        summaryActiveStatus.className = '';
      }
      
      const levelNames = {
        'low': 'Basic Shield (Low)',
        'medium': 'Moderate Shield (Medium)',
        'high': 'Advanced Shield (High)',
        'extreme': 'Strict Shield (Extreme)'
      };
      summaryActiveLevel.textContent = levelNames[activeLevel] || activeLevel;

      // Populate Whitelist & Blacklist
      renderDomainList('whitelist');
      renderDomainList('blacklist');

      // Populate Analytics & Insight numbers
      const stats = result.stats || {};
      const totalStats = stats.total || { total: 0, popups: 0, redirects: 0, overlays: 0, windows: 0 };
      const dailyStats = stats.daily || { total: 0 };
      const weeklyStats = stats.weekly || { total: 0 };
      const monthlyStats = stats.monthly || { total: 0 };

      statsTotalAll.textContent = totalStats.total || 0;
      statsTodayAll.textContent = dailyStats.total || 0;
      statsWeeklyAll.textContent = weeklyStats.total || 0;
      statsMonthlyAll.textContent = monthlyStats.total || 0;

      // Category counts
      barValPopups.textContent = totalStats.popups || 0;
      barValRedirects.textContent = totalStats.redirects || 0;
      barValOverlays.textContent = totalStats.overlays || 0;
      barValWindows.textContent = totalStats.windows || 0;

      // Category percentage bar calculations
      const maxVal = Math.max(
        totalStats.popups || 0,
        totalStats.redirects || 0,
        totalStats.overlays || 0,
        totalStats.windows || 0,
        1 // prevent division by zero
      );

      progressPopups.style.width = `${((totalStats.popups || 0) / maxVal) * 100}%`;
      progressRedirects.style.width = `${((totalStats.redirects || 0) / maxVal) * 100}%`;
      progressOverlays.style.width = `${((totalStats.overlays || 0) / maxVal) * 100}%`;
      progressWindows.style.width = `${((totalStats.windows || 0) / maxVal) * 100}%`;

      // Render top domains bar chart
      renderTopDomains(stats.topDomains || {});

      // Toggles switches states
      prefShowToasts.checked = result.showToasts !== false;
      prefConsoleLogging.checked = result.consoleLogging !== false;
      prefRemoveOverlays.checked = result.autoRemoveOverlays !== false;
    });
  }

  // 3. Selection of Protection Levels card
  levelCards.forEach(card => {
    card.addEventListener('click', () => {
      const selectedLevel = card.getAttribute('data-level');
      
      chrome.storage.local.set({ protectionLevel: selectedLevel }, () => {
        // Broadcast configuration modification to all loaded tabs
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'REDIRECT_SHIELD_STATE_CHANGED' }).catch(() => {});
          });
        });
        loadSettings();
      });
    });
  });

  // 4. Whitelist / Blacklist modification events
  addWhitelistBtn.addEventListener('click', () => addDomain('whitelist'));
  whitelistInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addDomain('whitelist'); });
  whitelistSearch.addEventListener('input', () => renderDomainList('whitelist'));

  addBlacklistBtn.addEventListener('click', () => addDomain('blacklist'));
  blacklistInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addDomain('blacklist'); });
  blacklistSearch.addEventListener('input', () => renderDomainList('blacklist'));

  // Clean domain input formatting and add to storage array
  function addDomain(type) {
    const inputEl = type === 'whitelist' ? whitelistInput : blacklistInput;
    let domainStr = inputEl.value.trim().toLowerCase();

    if (!domainStr) return;

    // Standardize URLs to clean domain names (strip protocol and paths)
    try {
      if (domainStr.includes('://')) {
        const urlObj = new URL(domainStr);
        domainStr = urlObj.hostname;
      } else {
        // Parse raw string using virtual URL to ensure subdomain components remain valid
        const urlObj = new URL('http://' + domainStr);
        domainStr = urlObj.hostname;
      }
    } catch (e) {
      alert('Invalid domain format entered. Please enter a valid host name like example.com.');
      return;
    }

    if (!domainStr || !domainStr.includes('.')) {
      alert('Invalid domain format. Domain must contain a valid TLD extension (e.g. site.com).');
      return;
    }

    const currentList = appState[type] || [];
    if (currentList.includes(domainStr)) {
      alert('This domain already exists on this list.');
      return;
    }

    currentList.push(domainStr);
    
    // Clear conflicting domain entries on the other array list
    const oppositeType = type === 'whitelist' ? 'blacklist' : 'whitelist';
    const oppositeList = appState[oppositeType] || [];
    const confIdx = oppositeList.indexOf(domainStr);
    if (confIdx > -1) {
      oppositeList.splice(confIdx, 1);
    }

    chrome.storage.local.set({ 
      [type]: currentList,
      [oppositeType]: oppositeList
    }, () => {
      inputEl.value = '';
      loadSettings();
      // Notify active tabs of changes
      notifyTabsOfChange();
    });
  }

  // Notify tabs of list configurations updates
  function notifyTabsOfChange() {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'REDIRECT_SHIELD_STATE_CHANGED' }).catch(() => {});
      });
    });
  }

  // Delete domain helper
  function deleteDomain(type, domain) {
    const list = appState[type] || [];
    const idx = list.indexOf(domain);
    if (idx > -1) {
      list.splice(idx, 1);
      chrome.storage.local.set({ [type]: list }, () => {
        loadSettings();
        notifyTabsOfChange();
      });
    }
  }

  // Renders whitelist/blacklist lists inside containers
  function renderDomainList(type) {
    const listEl = type === 'whitelist' ? whitelistList : blacklistList;
    const searchEl = type === 'whitelist' ? whitelistSearch : blacklistSearch;
    const items = appState[type] || [];
    const searchQuery = searchEl.value.trim().toLowerCase();

    listEl.innerHTML = '';

    const filtered = items.filter(domain => domain.includes(searchQuery));

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="domain-item"><span style="color: var(--text-muted); font-style: italic;">No domains found.</span></li>`;
      return;
    }

    // Sort alphabetically
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

  // Dynamic visual layout for top blocked domains progress chart
  function renderTopDomains(topDomains) {
    topDomainsContainer.innerHTML = '';
    
    const entries = Object.entries(topDomains);
    if (entries.length === 0) {
      topDomainsContainer.innerHTML = `<p class="no-data">No data recorded yet. Safe browsing!</p>`;
      return;
    }

    // Calculate maximum value to determine lengths proportionally
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
          <div class="chart-progress-inner" style="width: ${percent}%"></div>
        </div>
      `;
      topDomainsContainer.appendChild(row);
    });
  }

  // 5. Hook Preference updates triggers
  prefShowToasts.addEventListener('change', () => {
    chrome.storage.local.set({ showToasts: prefShowToasts.checked });
  });

  prefConsoleLogging.addEventListener('change', () => {
    chrome.storage.local.set({ consoleLogging: prefConsoleLogging.checked });
  });

  prefRemoveOverlays.addEventListener('change', () => {
    chrome.storage.local.set({ autoRemoveOverlays: prefRemoveOverlays.checked });
  });

  // 6. Settings Import and Exports
  exportBtn.addEventListener('click', () => {
    chrome.storage.local.get(null, (data) => {
      // Exclude session variables and keep only critical parameters
      const backupData = {
        enabled: data.enabled !== false,
        protectionLevel: data.protectionLevel || 'high',
        whitelist: data.whitelist || [],
        blacklist: data.blacklist || [],
        showToasts: data.showToasts !== false,
        consoleLogging: data.consoleLogging !== false,
        autoRemoveOverlays: data.autoRemoveOverlays !== false,
        stats: data.stats || {}
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `redirect_shield_config_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
    });
  });

  importTrigger.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        
        // Basic configuration structural verification
        if (
          parsed.whitelist !== undefined &&
          parsed.blacklist !== undefined &&
          parsed.protectionLevel !== undefined
        ) {
          chrome.storage.local.set(parsed, () => {
            alert('Settings and block analytics loaded successfully!');
            loadSettings();
            notifyTabsOfChange();
          });
        } else {
          alert('Failed to import: Invalid configuration schema layout.');
        }
      } catch (err) {
        alert('Failed to read config: File contains invalid JSON structures.');
      }
    };
    reader.readAsText(file);
  });

  // Factory reset extension stats & values
  factoryResetBtn.addEventListener('click', () => {
    if (confirm('CAUTION: You are about to perform a Factory Reset. This restores all domains whitelist, blacklist, and block records history. Proceed?')) {
      chrome.storage.local.clear(() => {
        // Triggers default initializer in background.js on restart
        chrome.runtime.reload();
      });
    }
  });

  // Set message updates receiver from service workers
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'REDIRECT_SHIELD_STATS_UPDATED') {
      loadSettings();
    }
  });

  // Initial config load
  loadSettings();
});
