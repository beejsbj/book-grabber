# Configuration and operations

## Requirements

- Node.js 20 or newer, including npm
- Git
- a valid MAM account/session
- a reachable qBittorrent Web API

## Installation

`book-grabber` is not published to the npm registry. Install an explicit Git
release tag:

```sh
npm install --global git+https://github.com/beejsbj/book-grabber.git#v1.0.1
```

Verify the installed CLI and its qBittorrent connection:

```sh
book-grabber --version
book-grabber health --json
```

## Environment

The process intentionally does not load `.env` files. Copy the variable names
from [`.env.example`](../.env.example) into a secret-aware service environment,
shell, or environment manager. Never commit populated values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MAM_ID` | For search and grab | MAM session ID, sent only as the `mam_id` cookie |
| `QBIT_URL` | For health and grab | Explicit HTTP(S) qBittorrent Web API URL without embedded credentials |
| `QBIT_USERNAME` | When qBittorrent requires login | qBittorrent Web API username |
| `QBIT_PASSWORD` | When qBittorrent requires login | qBittorrent Web API password |
| `DATA_DIR` | No | Local state directory; defaults to `./data` |
| `DL_SAVE_PATH` | No | Save path sent with new qBittorrent handoffs |
| `AUTH_USER` | With `AUTH_PASS` for authenticated UI/API access | HTTP Basic username |
| `AUTH_PASS` | With `AUTH_USER` for authenticated UI/API access | HTTP Basic password |

Keep `MAM_ID`, qBittorrent credentials, and UI credentials out of commands,
logs, issue reports, and repositories. Temporary shell exports may be retained
in shell history; prefer a secret manager or service environment.

## Persistent state

`DATA_DIR` is separate from the installed package. It contains:

- `downloads-history.json`
- `books-wanted.md`
- `books-not-found.md`
- `books-failed.md`

These legacy-compatible filenames are intentional. State changes use atomic
file replacement and a process lock at `.book-grabber.lock`. A live competing
writer eventually returns a retryable state error; a lock whose recorded
process no longer exists is cleared automatically.

Back up `DATA_DIR` before changing versions or repairing state. History records
accepted qBittorrent handoffs, not completed downloads.

## Upgrade and rollback

1. Stop the service or process.
2. Preserve the state directory.
3. Install the intended tag with the same global install command.
4. Restart through the same service/environment manager.
5. Run `book-grabber --version` and `book-grabber health --json`.

To roll back, repeat the procedure with the prior tag. Review release notes for
state-format changes before upgrading. See the [CLI error reference](cli.md) for
exit-code meanings when a post-upgrade check fails.
