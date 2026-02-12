# Kaigosha Site Timer (Chrome Extension)

Kaigosha enforces strict, per-site usage limits with cooldowns, daily caps, custom tracked domains, warnings, and PIN-protected emergency unlock.

## Features

- Per-site limits:
  - daily limit
  - session limit
  - cooldown window
- Strict enforcement across tab/navigation events
- Custom site list (X/Instagram presets included)
- In-page timer overlay (position + on/off control)
- 1-minute warning with optional browser notifications
- Break-glass unlock with PIN + daily usage cap
- Diagnostics page with runtime state and event log

## Storage Model

- `chrome.storage.sync`: settings (`settings_v2`)
- `chrome.storage.local`: runtime counters, diagnostics, event log, break-glass runtime

This keeps counters reliable while syncing configuration across devices.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Usage

- Popup:
  - live per-site status
  - overlay toggle
  - break-glass unlock action
- Options page:
  - full site management
  - warning + overlay config
  - break-glass policy + PIN
- Diagnostics page:
  - inspect state and clear diagnostics log

## Development

Run tests:

```bash
npm test
```
