# book-grabber

`book-grabber` searches MyAnonamouse (MAM) and hands a selected torrent to qBittorrent. It is designed to run locally by default and has no public bind default.

## Install and configure

Requires Node 20 or newer. Install with `npm install`, copy `.env.example` into an environment manager of your choice, and set every required value explicitly. The program does not load `.env` files itself.

`MAM_ID` is the MAM session ID. It is sent only as `mam_id=<MAM_ID>`. `QBIT_URL` must be an explicit HTTP(S) qBittorrent URL with no embedded credentials. `QBIT_USERNAME` and `QBIT_PASSWORD` are used only when qBittorrent requests a login. `DATA_DIR` defaults to `./data`; existing `downloads-history.json`, `books-wanted.md`, `books-not-found.md`, and `books-failed.md` retain their formats.

## CLI

All non-server commands require `--json` and write exactly one JSON envelope to stdout.

```sh
book-grabber health --json
book-grabber search "Ursula Le Guin" --page 0 --json
book-grabber grab 12345 --json
book-grabber history --json
book-grabber queue list --json
book-grabber queue add "A wanted book" --json
book-grabber not-found remove "A missing book" --json
book-grabber serve --host 127.0.0.1 --port 3000
book-grabber --help
book-grabber --version
```

`serve` also writes one success envelope, after the listener has bound, and otherwise remains running. `--help` and `--version` are the intentional human-readable stdout exceptions; they do not require `--json`.

Exit codes: `2` arguments, `3` configuration, `4` authentication, `5` upstream/network, `6` qBittorrent rejection, `7` state I/O, `8` internal.

## Web service

The server defaults to `127.0.0.1:3000`. Wildcard binds are refused. A non-loopback bind is allowed only when it is an address assigned to the host in `100.64.0.0/10`, and requires `AUTH_USER` and `AUTH_PASS`; detailed API routes then use HTTP Basic authentication. `/api/health` is a minimal unauthenticated liveness response; add `?detail=1` for the authenticated dependency check.

The retained API routes are `/api/health`, `/api/search`, `/api/download`, `/api/status`, `/api/downloads`, `/api/queue`, `/api/not-found`, and `/api/failed`.

## Development

```sh
npm test
npm pack --dry-run
npm audit --omit=dev
```

Tests use fixtures and mocks only: they do not contact MAM, qBittorrent, or download content.
