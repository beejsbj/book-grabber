# book-grabber

`book-grabber` is a small, self-hosted bridge between book search and a
qBittorrent instance you control. It does four things:

1. Search the configured book source.
2. Let you deliberately choose one result.
3. Hand that result to qBittorrent.
4. Keep local history and reading-list state.

Today the only supported source is
[MyAnonamouse](https://www.myanonamouse.net/) (MAM). You bring your own valid
MAM session and qBittorrent instance. This project does not host books or
torrent files, provide accounts or credentials, or bypass access controls. Use
it only with material you are authorized to access, and follow the source's
rules and applicable law.

The primary interface is a stable JSON CLI for agents and scripts. An optional
private browser UI ships in the same process.

## Before you start

You need:

- Node.js 20 or newer, including npm
- Git
- a valid MAM account and session
- qBittorrent with its Web UI/Web API enabled

## 60-second first search

This project is not published to the npm registry. Install a pinned Git release
tag:

```sh
npm install --global git+https://github.com/beejsbj/book-grabber.git#v1.0.1
```

For a temporary smoke test, replace these placeholders with your private
values. Your shell may record exported values in its history; use a secret
manager or service environment for a lasting installation.

```sh
export MAM_ID='your-mam-session-id'
export QBIT_URL='http://127.0.0.1:8080'
export QBIT_USERNAME='your-qbittorrent-user'
export QBIT_PASSWORD='your-qbittorrent-password'

book-grabber health --json
book-grabber search "sample query" --page 0 --json
```

Read the results, choose a `sourceId` yourself, and only then perform the
state-changing handoff:

```sh
book-grabber grab '<source-id-you-chose>' --json
```

`accepted: true` means qBittorrent accepted the handoff. It does not mean the
download has completed.

## Safety boundaries

| Read-only | Changes external or local state |
| --- | --- |
| `health`, `search`, `history` | `grab` |
| `queue list`, `not-found list`, `failed list` | `queue add`, `not-found add`, `not-found remove`, `failed remove` |

A search contacts MAM using your configured session, but creates no handoff and
changes no local state.

A search result is a candidate, not permission to grab it. Require an explicit
user choice of the exact `sourceId`. Keep MAM and qBittorrent credentials out
of repositories, logs, issue reports, and populated environment files.

The browser service binds to loopback by default and refuses wildcard binds.
An explicit Tailscale-address bind requires HTTP Basic authentication. Do not
expose it through Tailscale Funnel.

## Agent interface

Every operation command emits exactly one versioned JSON envelope on stdout.
Agents should parse that object, use the process exit status, and never infer
success from stderr or prose. See the [CLI and JSON contract](docs/cli.md) for
the complete command and error reference.

## Optional web UI

```sh
book-grabber serve
# open http://127.0.0.1:3000
```

The UI and API use the same operations and state as the CLI. See the
[web-service guide](docs/web-service.md) before binding beyond loopback or
placing a private proxy in front of it.

## Documentation

- [CLI and JSON contract](docs/cli.md)
- [Configuration, state, installation, and upgrades](docs/operations.md)
- [Private web UI and HTTP API](docs/web-service.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Recovery provenance](PROVENANCE.md)
- [MIT license](LICENSE)
