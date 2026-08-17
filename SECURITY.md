# Security policy

Do not report credentials, session cookies, torrent payloads, or upstream response bodies in an issue. Use a private contact path with the maintainer for a suspected vulnerability.

The service intentionally has no credential defaults, sends only the exact MAM `mam_id` cookie, validates torrent content before handoff, refuses wildcard binds, and requires Basic authentication for permitted non-loopback binds.
