# Implementation Plan - Redirect Shield Chrome Extension

Implement a lightweight, highly-effective, and aesthetically stunning Chrome Extension to prevent unwanted redirects, popups, click-hijacking, and ads.

## User Review Required

> [!IMPORTANT]
> **Keyboard Shortcut Collision**: The requested shortcut `Ctrl+Shift+B` is Chrome's default shortcut to toggle the Bookmarks Bar. While we will register `Ctrl+Shift+B` in the `manifest.json`, users may need to manually rebind it in `chrome://extensions/shortcuts` if it conflicts on their systems. We will also register `Alt+Shift+S` as a fallback option.

> [!NOTE]
> **Isolated World vs. Main World**: Modern Chrome Extension architecture isolates content scripts. To successfully hook into global functions like `window.open` or prototype methods on `Location`, we must inject a helper script (`inject.js`) into the page's MAIN execution world. We will pass configurations dynamically from `content.js` to `inject.js` via a temporary DOM element before execution.

---

## Proposed Changes

We will create all extension files in the `RedirectShield` root workspace directory.

```
RedirectShield/ (Workspace root)
├── manifest.json
├── background.js
├── content.js
├── inject.js
├── generate_icons.js  (Helper script to write icons to icons/)
├── README.md
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Manifest

#### [NEW] [manifest.json](file:///c:/Users/ASUS/Desktop/redirect%20shield/manifest.json)
Configure Manifest V3 settings, including background service worker, actions, popup, options, permissions (`storage`, `tabs`, `activeTab`, `scripting`), host permissions (`<all_urls>`), keyboard shortcuts, and declare `inject.js` as a web-accessible resource.

### Extension Logic

#### [NEW] [background.js](file:///c:/Users/ASUS/Desktop/redirect%20shield/background.js)
The core service worker.
- Manages global state (enabled/disabled) and statistics in `chrome.storage.local`.
- Listens for blocked events from tabs and updates statistical metrics (daily, weekly, monthly, top domains).
- Listens for command execution (`toggle-protection` shortcut).
- Synchronizes configuration updates between content scripts, options page, and popup.

#### [NEW] [content.js](file:///c:/Users/ASUS/Desktop/redirect%20shield/content.js)
Runs at `document_start` on every page.
- Fetches the active configuration for the current domain.
- Injects a script configuration object into the page context.
- Appends `inject.js` to the page DOM's MAIN world.
- Runs a lightweight, throttled `MutationObserver` (if protection is High/Extreme) to remove invisible overlays, fake download buttons, and popup containers.
- Implements a Shadow-DOM based toast notification system that renders block alerts inside the webpage without style pollution.

#### [NEW] [inject.js](file:///c:/Users/ASUS/Desktop/redirect%20shield/inject.js)
Executes directly in the website's MAIN execution world.
- Overrides `window.open`.
- Overrides `Location.prototype.assign` and `Location.prototype.replace`.
- Hooks `History.prototype.pushState` and `History.prototype.replaceState`.
- Hijacks the document level capture-phase `click` event listener to stop hijack divs or external redirection triggers.
- Communicates blocked actions back to `content.js` via `window.postMessage`.

### Popup Interface

#### [NEW] [popup.html](file:///c:/Users/ASUS/Desktop/redirect%20shield/popup/popup.html)
Main popup interface utilizing glassmorphism and an immersive dark interface. Contains dynamic toggle, state indicators, animated counter panels, and fast configuration actions.

#### [NEW] [popup.css](file:///c:/Users/ASUS/Desktop/redirect%20shield/popup/popup.css)
Visual styling for the popup. Follows responsive dark aesthetics, CSS variables for colors, backdrop blurs (`backdrop-filter`), glowing success effects, and clean micro-animations.

#### [NEW] [popup.js](file:///c:/Users/ASUS/Desktop/redirect%20shield/popup/popup.js)
Logic for the popup interface. Queries current domain status, updates toggle state, renders live stats, handles whitelist/blacklist toggles, and resets statistics.

### Options & Settings

#### [NEW] [options.html](file:///c:/Users/ASUS/Desktop/redirect%20shield/options/options.html)
Configuration panel. Features modular columns for protection level selectors (Low, Medium, High, Extreme), whitelist/blacklist search/edit panels, and graphical stats insights.

#### [NEW] [options.css](file:///c:/Users/ASUS/Desktop/redirect%20shield/options/options.css)
Styles for options page. Incorporates grid layout, modern transitions, interactive inputs, and dark-themed glassmorphism cards.

#### [NEW] [options.js](file:///c:/Users/ASUS/Desktop/redirect%20shield/options/options.js)
Controls the configuration panel. Syncs whitelist/blacklist inputs with storage, visualizes statistical graphs (using custom CSS bars), and exposes data import/export structures.

### Icon Assets & Documentation

#### [NEW] [generate_icons.js](file:///c:/Users/ASUS/Desktop/redirect%20shield/generate_icons.js)
A script that writes high-resolution PNG icons to the `icons/` folder, decoded from beautiful pre-drawn base64 representations.

#### [NEW] [README.md](file:///c:/Users/ASUS/Desktop/redirect%20shield/README.md)
Comprehensive, professional documentation covering architectural details, permissions, privacy policy, instructions, and futures roadmap.

---

## Verification Plan

### Automated Tests
We will verify configuration validity and scripts compile correctly:
- Run a Node.js validation command to ensure all JS files are syntax-valid.
- Verify `manifest.json` parsing.

### Manual Verification
1. Load unpacked extension in Google Chrome.
2. Verify the popup UI works, switches status, and displays the correct active website domain.
3. Test redirect blocker on test redirects (simulating `window.open` and click-hijacking via a local server or simple sandbox HTML files).
4. Verify options page successfully saves whitelist modifications and changes protection levels.
5. Verify keyboard shortcut Alt+Shift+S (and Ctrl+Shift+B fallback) triggers status toggle.
