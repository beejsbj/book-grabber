# Contributing

Please open an issue before a substantial change, and keep pull requests focused. Keep MAM behavior in the dedicated source client and keep the operations module as the single owner of health, search, handoff, and state workflows. Do not add a generic source plugin layer prematurely: this project is intentionally MAM-only today.

Add offline tests for behavior changes. Before proposing a change, run `npm test`, `npm pack --dry-run`, and `npm audit --omit=dev`. Never include session IDs, qBittorrent credentials, torrent payloads, or real reading-list data in code, fixtures, logs, issues, or pull requests. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.
