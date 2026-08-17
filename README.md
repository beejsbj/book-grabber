# book-grabber

`book-grabber` is a MAM-only book search and qBittorrent handoff tool. It is designed to run locally by default and never binds publicly by default. It does not currently support other sources or an integration with Anna's Archive.

## Install and configure

Requires Node 20 or newer. This package is distributed from GitHub releases, not npm. With Git available, install a released CLI globally with:

```sh
npm install --global git+https://github.com/beejsbj/book-grabber.git#v1.0.0
```

For local development:

```sh
git clone https://github.com/beejsbj/book-grabber.git
cd book-grabber
npm ci
npm test
```

Copy `.env.example` into your environment manager of choice and set every required value explicitly. The program intentionally does not load `.env` files itself, so use your operating system's service manager, a shell environment, or another secret-aware environment manager to provide variables at runtime. Do not commit a populated environment file.

`MAM_ID` is the MAM session ID. It is sent only as `mam_id=<MAM_ID>`. `QBIT_URL` must be an explicit HTTP(S) qBittorrent URL with no embedded credentials. `QBIT_USERNAME` and `QBIT_PASSWORD` are used only when qBittorrent requests a login. `DATA_DIR` defaults to `./data`; existing `downloads-history.json`, `books-wanted.md`, `books-not-found.md`, and `books-failed.md` retain their formats.

## CLI

All non-server commands require `--json` and write exactly one JSON envelope to stdout.

```sh
book-grabber health --json
book-grabber search "sample query" --page 0 --json
book-grabber grab <source-id> --json
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

## JSON contract for agents

Every non-server CLI command requires `--json` and writes exactly one JSON object to stdout. A successful command has `{ "schemaVersion": "1", "ok": true, "command": "…", "data": … }`; a failed command has `{ "schemaVersion": "1", "ok": false, "command": "…", "error": { "code": "…", "message": "…", "retryable": false } }`. Agents should parse stdout as JSON, use the process exit status, and never infer success from prose or stderr.

For example, a queue read is safe and does not contact MAM or qBittorrent:

```json
{"schemaVersion":"1","ok":true,"command":"queue","data":[{"text":"example request","done":false}]}
```

Search and `grab` contact MAM; `grab` also hands the selected torrent to qBittorrent and changes download history. Treat both as explicit user-authorized actions.

## Web service

The server defaults to `127.0.0.1:3000`. Wildcard binds are refused. A non-loopback bind is allowed only when it is an address assigned to the host in `100.64.0.0/10`, and requires `AUTH_USER` and `AUTH_PASS`; detailed API routes then use HTTP Basic authentication. `/api/health` intentionally exposes only `{ok:true,live:true}` without authentication for liveness. The authenticated `/api/health?detail=1` compatibility response includes `mamConfigured`, `qbitUrl`, `qbitReachable`, and `dataDir`.

The retained API routes are `/api/health`, `/api/search`, `/api/download`, `/api/status`, `/api/downloads`, `/api/queue`, `/api/not-found`, and `/api/failed`.

For tailnet-only browser access, keep `book-grabber` bound to loopback and put [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve) in front of it. Limit access with tailnet ACLs/grants, review the identity policy before sharing, and do not use Funnel for this service. A direct non-loopback bind is deliberately restricted to an assigned Tailscale address and requires `AUTH_USER` and `AUTH_PASS`.

## Upgrade and rollback

Pin each installation to a Git tag. To upgrade, stop the process, install the desired tag with the same global-install command, restart it through your environment manager, then run `book-grabber health --json`. To roll back, repeat the install using the prior tag and restart. The state directory is deliberately separate from the package, so retain it before any version change; release notes should identify any state-format migration before you proceed.

## Development

```sh
npm test
npm pack --dry-run
npm audit --omit=dev
```

Tests use fixtures and mocks only: they do not contact MAM, qBittorrent, or download content.
