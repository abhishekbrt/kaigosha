# Kaigosha Site Timer (Chrome Extension)

Kaigosha limits usage of `x.com`/`twitter.com` and `instagram.com` using:

- per-site daily limit
- per-site one-session limit
- per-site cooldown between sessions

When a site is blocked, the tab is redirected to an extension block page with remaining time.

## Defaults

For both X and Instagram:

- daily limit: 30 min
- one session: 10 min
- cooldown: 2 min

## How it Works

- A content script sends heartbeat pings every second only when the tab is visible and focused.
- The service worker tracks per-site state.
- At session limit: cooldown starts.
- At daily limit: block lasts until local midnight.
- Any attempt to open a blocked site is redirected to the block page.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `kaigosha`.

## Development

- Run tests:

```bash
npm test
```
