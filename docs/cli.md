# CLI and JSON contract

The CLI is the primary interface for agents and scripts. Every operation
command requires `--json` and writes exactly one JSON object to stdout.

## Commands

| Command | Effect |
| --- | --- |
| `book-grabber health --json` | Check configuration and qBittorrent reachability. |
| `book-grabber search "<query>" [--page N] --json` | Search MAM. `N` must be a non-negative integer. |
| `book-grabber grab <source-id> --json` | Fetch the selected torrent, submit it to qBittorrent, and record the accepted handoff. |
| `book-grabber history --json` | Read local handoff history. |
| `book-grabber queue list --json` | Read the wanted-books queue. |
| `book-grabber queue add "<text>" --json` | Add an entry to the wanted-books queue. |
| `book-grabber not-found list --json` | Read the not-found list. |
| `book-grabber not-found add "<text>" --json` | Add an entry to the not-found list. |
| `book-grabber not-found remove "<exact title>" --json` | Remove a matching not-found entry. |
| `book-grabber failed list --json` | Read the failed-download list. |
| `book-grabber failed remove "<exact title>" --json` | Remove a matching failed entry. |
| `book-grabber serve [--host IP] [--port PORT]` | Start the optional UI/API server. |
| `book-grabber --help` | Print human-readable help. |
| `book-grabber --version` | Print the package version. |

`health`, `search`, `history`, and every `list` command are read-only. `grab`,
`add`, and `remove` change external or local state. A search result is not
authorization to grab it; require an explicit choice of the exact `sourceId`.
Search does contact MAM using the configured session, but creates no handoff and
changes no local state.

Successful `grab` output with `accepted: true` means qBittorrent accepted the
handoff. It is not evidence that the download completed.

## Envelopes

A successful operation has this shape:

```json
{
  "schemaVersion": "1",
  "ok": true,
  "command": "queue",
  "data": [{ "text": "example request", "done": false }]
}
```

A failed operation has this shape:

```json
{
  "schemaVersion": "1",
  "ok": false,
  "command": "search",
  "error": {
    "code": "UPSTREAM",
    "message": "sanitized diagnostic",
    "retryable": false
  }
}
```

Parse stdout as JSON and use the process exit status. Treat stderr only as a
diagnostic channel. Do not scrape human-readable output.

`serve` is the non-operation exception: after its listener binds, it emits one
success envelope and remains running. `--help` and `--version` intentionally
emit human-readable text and do not require `--json`.

## Exit codes

| Exit | Meaning |
| ---: | --- |
| `2` | Invalid arguments or unsupported command/action |
| `3` | Missing or invalid configuration |
| `4` | Source authentication failure |
| `5` | Upstream or network failure |
| `6` | qBittorrent rejection or API failure |
| `7` | Local state I/O or locking failure |
| `8` | Unexpected internal failure |

Retry only when the error envelope reports `retryable: true`, and only within
the scope of the already-authorized action.
