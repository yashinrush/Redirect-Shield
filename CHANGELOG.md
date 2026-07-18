# Changelog

All notable changes to the **NexShield** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-07-05

### Added
- **Modular Utility Library**: Extracted shared logic into `utils/` folder (logger, storage, helpers, rules classifier, threat detector, overlay blocker, and Shadow DOM toast alert).
- **Deceptive Link Detector**: Flag fake play and download button links, highlight with red dashed borders, and prompt click confirmation warnings.
- **Local Site Reputation grading**: Dynamic safety checks (Safe, Warning, Suspicious) based on offline suffix heuristics and blocking logs.
- **Glassmorphic Theme**: Dark/light theme support in popup and options dashboard, with floating aurora animations.
- **Dynamic Chart Animations**: Smooth progress bar load widths in the analytics dashboard.
- **Configuration Migrations**: Import/export options to back up whitelists, blacklists, and metrics locally.

### Changed
- **Content Scripts**: Reorganized content script to load sequential utilities prior to startup checks.
- **API Prototype Hooks**: Overrode Location setters and forms submit actions inside the webpage's MAIN world context to prevent bypasses.

---

## [1.0.0] - 2026-06-12

### Added
- Initial baseline release of NexShield extension.
- Chrome Manifest V3 configuration support.
- Core popups blocking rules checking (`window.open`).
- Standard local storage Whitelist / Blacklist configurations.
- Action badge toggling (ON/OFF labels).
- Today / Lifetime block totals in popup panel.
