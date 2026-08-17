# Security policy

Do not report credentials, session cookies, torrent payloads, or upstream response bodies in an issue. Report a suspected vulnerability privately through [GitHub Security Advisories](https://github.com/beejsbj/book-grabber/security/advisories/new). Use [GitHub Issues](https://github.com/beejsbj/book-grabber/issues) only for non-sensitive bugs and questions.

The service intentionally has no credential defaults, sends only the exact MAM `mam_id` cookie, validates torrent content before handoff, refuses wildcard binds, and requires Basic authentication for permitted non-loopback binds.
