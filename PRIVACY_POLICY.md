# Privacy Policy

**Effective Date: July 5, 2026**

NexShield ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains our practices regarding user information and data security.

## 1. No Data Collection
NexShield **does not collect, track, store, or transmit** any personal data, browsing history, settings, or search queries. 

- **No Remote Telemetry**: The extension does not communicate with external analytics servers, databases, or API logs.
- **No Third-Party Trackers**: We do not integrate advertisements, tracking pixels, or third-party analytics software.

## 2. Fully Local Execution
All settings, domain whitelist/blacklist arrays, and block counts statistics are stored locally on your device in your browser's isolated profile storage using the standard `chrome.storage.local` API.

- This configuration data remains local to your browser profile.
- Clearing your browser data or executing a "Factory Reset" inside the extension dashboard will permanently delete these local settings and counters.

## 3. Webpage Content Access
The extension requires access permissions for all URLs (`<all_urls>`) to run rules intercepts. This script is used exclusively to:
- Override page redirection API endpoints (e.g. `window.open`).
- Remove transparent overlay divs from active page layouts.
- Flag deceptive elements (like fake play/download buttons) and prompt click confirmation warnings.

This content is processed locally and transiently in memory on your machine. No web page DOM contents are stored or transmitted.

## 4. Policy Compliance
This policy is designed to comply with:
- Google Chrome Web Store Developer Agreement and User Data Guidelines.
- Microsoft Edge Extensions Developer Policies.
- Brave and Opera Extensions Privacy Requirements.

## 5. Contact
If you have questions regarding our privacy practices, you can review the full open-source codebase in this extension folder or contact the developers.
