# Contributing

Please open an issue before a substantial change, and keep pull requests focused. Keep MAM behavior in the dedicated source client and keep the operations module as the single owner of health, search, handoff, and state workflows. Do not add a generic source plugin layer prematurely: this project is intentionally MAM-only today.

## Development

```sh
git clone https://github.com/beejsbj/book-grabber.git
cd book-grabber
npm ci
npm test
npm pack --dry-run
npm audit --omit=dev
```

Tests use fixtures and mocks only; they must not contact MAM, qBittorrent, or
download content. Add offline tests for behavior changes.

Never include session IDs, qBittorrent credentials, torrent payloads, or real
reading-list data in code, fixtures, logs, issues, or pull requests. See
[SECURITY.md](SECURITY.md) for private vulnerability reporting.
