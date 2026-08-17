# Provenance

Behavior was recovered for compatibility from the immutable reference image digest `ghcr.io/beejsbj/mam-grabber@sha256:62431985536c61e4f463d0f092b9605a89229bb44ecee20815ca6627622b1772`.

The image `/app/server.js` SHA-256 was `db7d50eae638e31de6fa96d9eeb0c2de7c21a826b9f0b33e7ed738c85143235d`. The comparison configuration file SHA-256 was `6c9b57ee0e0ed6eed515af5b9011914d754bab9c79398360173d164a223bd5dd`. Neither source file nor any credential fallback is included in this package.

Compatibility retained: MAM search parameters and normalized book fields, torrent download endpoint, qBittorrent API handoff, retained API routes, and the four legacy state filenames. Security behavior intentionally differs: no qBittorrent URL default, exact single-cookie MAM authentication, no upstream response fragments in errors, serialized atomic state writes, synchronous handoff acknowledgement, and restricted web binds.

The recovered image also contained a 43 KB single-file static interface. It was reviewed for observable behavior but not copied wholesale because it was tightly coupled to the legacy asynchronous download and response shapes. The replacement preserves its Search, History, Queue, Not Found, and Failed tabs plus search/grab/add/remove flows, while using the synchronous acknowledgement and authenticated route behavior of this package.

Health compatibility is split deliberately: unauthenticated `/api/health` is reduced to minimal liveness fields, while the legacy-compatible dependency and path fields are available only from authenticated `/api/health?detail=1`. New download records retain legacy `id`, `ts`, `status: "added"`, and newest-first ordering alongside normalized `source` and `sourceId` fields.
