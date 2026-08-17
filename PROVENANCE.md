# Provenance

Behavior was recovered for compatibility from the immutable reference image digest `ghcr.io/beejsbj/mam-grabber@sha256:62431985536c61e4f463d0f092b9605a89229bb44ecee20815ca6627622b1772`.

The image `/app/server.js` SHA-256 was `db7d50eae638e31de6fa96d9eeb0c2de7c21a826b9f0b33e7ed738c85143235d`. The comparison configuration file SHA-256 was `6c9b57ee0e0ed6eed515af5b9011914d754bab9c79398360173d164a223bd5dd`. Neither source file nor any credential fallback is included in this package.

Compatibility retained: MAM search parameters and normalized book fields, torrent download endpoint, qBittorrent API handoff, retained API routes, and the four legacy state filenames. Security behavior intentionally differs: no qBittorrent URL default, exact single-cookie MAM authentication, no upstream response fragments in errors, serialized atomic state writes, synchronous handoff acknowledgement, and restricted web binds.
