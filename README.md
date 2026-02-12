# Kaigosha Site Timer (Chrome Extension)

Kaigosha is a Chrome extension that enforces time limits on distracting websites.

It supports per-site limits, cooldown windows, strict tab enforcement, custom tracked domains, warning notifications, and PIN-protected temporary unlock.

## Repository

- GitHub: `https://github.com/abhishekbrt/kaigosha`
- Default branch: `main`

## Features

- Per-site policy:
  - Daily limit
  - Session limit
  - Cooldown duration
- Strict enforcement:
  - Re-checks across tab updates, tab activation, tab creation/replacement, and web navigation events
- Custom sites:
  - X/Twitter and Instagram presets included
  - Add/edit/remove your own domains
- Live in-page overlay timer
- 1-minute session warning (optional browser notification)
- Break-glass unlock:
  - PIN-protected temporary unlock window
  - Daily unlock usage cap
- Diagnostics page:
  - Runtime state snapshot
  - Event log
  - Migration/debug status

## Installation (Developer Mode)

1. Clone this repository:

   ```bash
   git clone https://github.com/abhishekbrt/kaigosha.git
   cd kaigosha
   git checkout main
   ```

2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.

After loading, pin the extension from Chrome toolbar if you want quick access.

## Quick Start

1. Open the extension popup.
2. Click **Open Full Settings**.
3. Configure sites and limits:
   - Domain list (comma-separated)
   - Daily/session/cooldown values
4. Save settings.
5. (Optional) Configure warning notification and overlay position.
6. (Optional) Set a break-glass PIN.

## How It Works

- A content script runs on HTTP/HTTPS pages and sends heartbeat/status requests using only the page hostname.
- Background service worker applies time accounting and block state transitions.
- On block state, opening a tracked site redirects to extension block page.
- Daily limit blocks until local midnight.
- Session limit triggers cooldown.

## Pages and Controls

### Popup

- Live status per tracked site
- Overlay on/off toggle
- Break-glass unlock action
- Links to full settings and diagnostics

### Options Page

- Manage tracked site list
- Configure warning and overlay behavior
- Configure break-glass policy
- Set/clear break-glass PIN

### Block Page

- Shows block reason and countdown
- Accepts PIN for temporary unlock
- Retry button for reopening target site

### Diagnostics Page

- Displays sanitized settings, runtime counters, and event logs
- Clear diagnostics action

## Storage Model

- `chrome.storage.sync`
  - Settings (`settings_v2`)
- `chrome.storage.local`
  - Runtime counters
  - Break-glass runtime
  - Diagnostics metadata
  - Event log

This keeps usage counters device-local (reliable) while syncing configuration between signed-in Chrome profiles.

## Security and Privacy Notes

- The extension needs broad HTTP/HTTPS host permissions to support custom domains.
- Heartbeat/status messages use hostname (not full URL path/query).
- Break-glass PIN is not stored in plaintext:
  - Random salt + PBKDF2-SHA256 hash
  - High iteration count (`pinIterations`)
- Diagnostics responses redact PIN hash/salt.
- Block-page return navigation is URL-sanitized:
  - Only `http/https`
  - Must match allowed tracked domain(s)

## Permissions

- `storage`: persist settings/runtime
- `tabs`: enforce blocking on tab events
- `alarms`: periodic state reconciliation
- `notifications`: warning notifications
- `webNavigation`: stricter navigation enforcement
- Host permissions: `http://*/*`, `https://*/*`

## Limitations

- Chrome desktop (MV3) only
- Incognito enforcement depends on extension incognito setting in Chrome
- `chrome.storage.sync` may hit quota for very large settings payloads (local backup is maintained)

## Development

### Run Tests

```bash
npm test
```

### Syntax Check

```bash
node --check src/background/background.js
```

## Troubleshooting

- If behavior looks stale, click **Reload** on extension card in `chrome://extensions`.
- If a blocked site opens unexpectedly, check:
  - Site domains in options
  - Site is enabled
  - Break-glass is active
- Use diagnostics page for runtime/event visibility.

## License

Add your preferred license before publishing (for example: MIT).
