# book-grabber

`book-grabber` is a small self-hosted bridge between book search and qBittorrent. Its workflow is deliberately narrow:

1. Search the configured book source.
2. Deliberately choose one result.
3. Hand that result to your qBittorrent instance.
4. Keep local history and reading-list state.

Today the only supported source is [MyAnonamouse](https://www.myanonamouse.net/) (MAM). You need your own valid MAM account/session and a qBittorrent instance you control. The project does **not** host books or torrent files, provide accounts or credentials, or bypass a source's access controls. Use it only with services and material you are authorized to access, and comply with their rules and applicable law.

The primary interface is a stable JSON CLI for agents and scripts. The optional private browser UI is part of this same repository and process; start it with `book-grabber serve` when a person wants to use it.

## 60-second first search

With Node 20+, Git, and a qBittorrent instance with its Web UI/Web API enabled, replace these placeholders with your own private values. They affect only the current shell:

```sh
export MAM_ID='your-mam-session-id'
export QBIT_URL='http://127.0.0.1:8080'
export QBIT_USERNAME='your-qbittorrent-user'
export QBIT_PASSWORD='your-qbittorrent-password'
```

Install the pinned release tag, check the qBittorrent connection, then run a generic search:

```sh
npm install --global git+https://github.com/beejsbj/book-grabber.git#v1.0.0
book-grabber health --json
book-grabber search "sample query" --page 0 --json
```

Read the JSON results, choose a `sourceId` yourself, and only then perform the state-changing handoff:

```sh
book-grabber grab '<source-id-you-chose>' --json
```

`accepted: true` means qBittorrent accepted the handoff; it does not mean the download has completed.

## What is safe to automate?

The read-only commands are `health`, `search`, `history`, and the `list` forms of `queue`, `not-found`, and `failed`. `search` contacts MAM, but none of these commands creates a handoff or changes local reading state.

`grab` fetches the selected torrent from MAM, submits it to qBittorrent, and records the accepted handoff in local history. `queue add`, `not-found add`, `not-found remove`, and `failed remove` also change local state. Treat a search result as a candidate, not permission to grab it: require an explicit user choice of the exact `sourceId`.

## Requirements and configuration

- Node.js 20 or newer (including npm) and Git.
- A valid MAM account/session, supplied as `MAM_ID`.
- A reachable qBittorrent Web API, supplied as `QBIT_URL`; add `QBIT_USERNAME` and `QBIT_PASSWORD` if its API requires login.
- A writable `DATA_DIR` for the local history and lists (defaults to `./data`).

Copy the variable names from [`.env.example`](.env.example) into your operating system's service manager, shell environment, or another secret-aware environment manager:

| Variable | Required | Purpose |
| --- | --- | --- |
| `MAM_ID` | For search and grab | MAM session ID, sent only as the `mam_id` cookie |
| `QBIT_URL` | For health and grab | Base HTTP(S) URL of the qBittorrent Web API |
| `QBIT_USERNAME`, `QBIT_PASSWORD` | If qBittorrent requires login | Web API credentials |
| `DATA_DIR` | No | Local state directory; defaults to `./data` |
| `DL_SAVE_PATH` | No | qBittorrent save path included with new handoffs |
| `AUTH_USER`, `AUTH_PASS` | Together for a direct non-loopback bind | HTTP Basic credentials for the UI and detailed API routes |

The program intentionally does not load `.env` files itself. Do not commit a populated environment file or share session IDs and passwords. Set `AUTH_USER` and `AUTH_PASS` together; setting only one does not enable authentication on a loopback bind.

`QBIT_URL` must be an explicit HTTP(S) URL without embedded credentials. The local state files retain the legacy names `downloads-history.json`, `books-wanted.md`, `books-not-found.md`, and `books-failed.md`.

## Why Node and npm?

This is not a claim that Express is universally better than Python. This workload is network-bound, so Node/Express and a comparable Python stack are both sufficient on speed and efficiency. Version 1 keeps Node/Express because the recovered application was Node-based and this lets the CLI, operation core, API, and private UI share one compatibility-focused implementation. It is the lowest-risk reuse choice, not a capability advantage.

`curl` can download an installer or call an HTTP endpoint; it is not the runtime that owns MAM authentication, qBittorrent handoff, state locking, the CLI, and the UI. A Python rewrite is possible, but would be a packaging and compatibility project rather than a new capability. If this were designed from scratch with a single self-contained binary as a firm distribution requirement, Go would be a natural candidate.

This project is not published to the npm registry. `npm install` is used as a package installer for a pinned Git tag, selecting an explicit release instead of a moving branch:

```sh
npm install --global git+https://github.com/beejsbj/book-grabber.git#v1.0.0
```

## Command reference

All operation commands require `--json` and write exactly one JSON envelope to stdout.

```sh
book-grabber health --json
book-grabber search "sample query" --page 0 --json
book-grabber grab <source-id> --json
book-grabber history --json
book-grabber queue list --json
book-grabber queue add "A wanted book" --json
book-grabber not-found list --json
book-grabber not-found add "A missing book" --json
book-grabber not-found remove "A missing book" --json
book-grabber failed list --json
book-grabber failed remove "A failed book" --json
book-grabber serve --host 127.0.0.1 --port 3000
book-grabber --help
book-grabber --version
```

`serve` writes one success envelope after the listener has bound, then remains running. `--help` and `--version` are the intentional human-readable stdout exceptions; they do not require `--json`.

Exit codes: `2` arguments, `3` configuration, `4` authentication, `5` upstream/network, `6` qBittorrent rejection, `7` state I/O, `8` internal.

## JSON contract for agents

Every operation command returns one JSON object. A successful command has `{ "schemaVersion": "1", "ok": true, "command": "…", "data": … }`; a failed command has `{ "schemaVersion": "1", "ok": false, "command": "…", "error": { "code": "…", "message": "…", "retryable": false } }`. Parse stdout as JSON and use the process exit status; never infer success from prose or stderr.

For example, reading the wanted queue does not contact MAM or qBittorrent:

```json
{"schemaVersion":"1","ok":true,"command":"queue","data":[{"text":"example request","done":false}]}
```

## Private web UI and API

Start the same process with:

```sh
book-grabber serve --host 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`. The UI and API are private to the machine by default. Wildcard binds are refused. A non-loopback bind is allowed only on an address assigned to the host in `100.64.0.0/10` and requires `AUTH_USER` and `AUTH_PASS`; detailed routes then require HTTP Basic authentication. `/api/health` deliberately exposes only `{ok:true,live:true}` for liveness. `/api/health?detail=1` passes through the authentication layer and includes MAM configuration and qBittorrent/data-directory diagnostics; on a loopback bind it requires Basic authentication only when both authentication variables are set.

Retained API routes are `/api/health`, `/api/search`, `/api/download`, `/api/status`, `/api/downloads`, `/api/queue`, `/api/not-found`, and `/api/failed`. Keep the service on loopback and use [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve) with tailnet ACLs/grants for private remote browser access. Do not expose it through Tailscale Funnel.

## Upgrade, rollback, and development

Pin each installation to a Git tag. To upgrade or roll back, stop the process, install the intended tag with the same command, restart it through your environment manager, and run `book-grabber health --json`. The state directory is separate from the package; preserve it before a version change and check release notes for state-format migrations.

For local development:

```sh
git clone https://github.com/beejsbj/book-grabber.git
cd book-grabber
npm ci
npm test
npm pack --dry-run
npm audit --omit=dev
```

Tests use fixtures and mocks only: they do not contact MAM, qBittorrent, or download content. For contribution and security-reporting guidance, see [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Historical recovery and compatibility details, including retained legacy names, are in [PROVENANCE.md](PROVENANCE.md).
