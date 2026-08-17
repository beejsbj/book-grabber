# Private web UI and HTTP API

The optional UI/API server exposes the same operations and state as the CLI.

## Start locally

```sh
book-grabber serve
# open http://127.0.0.1:3000
```

Explicit options are also available:

```sh
book-grabber serve --host 127.0.0.1 --port 3000
```

After the listener binds, `serve` writes one JSON success envelope and remains
running.

## Bind and authentication policy

- The default is `127.0.0.1:3000`.
- Wildcard addresses such as `0.0.0.0` and `::` are refused.
- A non-loopback bind must be an address assigned to the host in
  `100.64.0.0/10`.
- Every permitted non-loopback bind requires both `AUTH_USER` and `AUTH_PASS`.
- On loopback, setting both authentication variables enables HTTP Basic
  authentication; setting neither leaves loopback routes unauthenticated.
- Setting only one of `AUTH_USER` or `AUTH_PASS` enables no authentication.

The unauthenticated liveness route is always limited to
`GET /api/health`, which returns `{ "ok": true, "live": true }` unless
`detail=1` is requested. Detailed health and every other route pass through the
authentication layer.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Minimal liveness response |
| `GET` | `/api/health?detail=1` | MAM, qBittorrent, and state-directory diagnostics |
| `GET` | `/api/search?q=<query>&page=<n>` | Search MAM |
| `POST` | `/api/download` | Submit a selected source ID to the grab workflow |
| `GET` | `/api/status` | Read handoff history |
| `GET` | `/api/downloads` | Compatibility alias for handoff history |
| `GET`, `POST` | `/api/queue` | List or add wanted books |
| `GET`, `POST`, `DELETE` | `/api/not-found` | List, add, or remove not-found entries |
| `GET`, `DELETE` | `/api/failed` | List or remove failed entries |

All state-changing routes require the same explicit authorization boundary as
their CLI equivalents. Do not treat a search response as permission to call
`POST /api/download`.

## Private remote access

Prefer a loopback bind with
[Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve) and appropriate
tailnet ACLs/grants. If binding directly to an assigned Tailscale address, set
both Basic-auth variables first.

Do not expose this service through Tailscale Funnel or a public reverse proxy.
The UI controls a private source session and qBittorrent handoffs.
