import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';
import { requireMam } from './config.js';

const BASE = 'https://www.myanonamouse.net';
const SEEDBOX_API = 'https://t.myanonamouse.net/json/dynamicSeedbox.php';
const ua = 'book-grabber/1.0';
const SESSION_FILE = 'mam-session.json';

export function mamCookie(config, mamId = config.mamId) {
  requireMam(config);
  return `mam_id=${mamId}`;
}

// MAM may hand back a replacement mam_id on any response. The latest one is
// kept in the state directory and preferred over MAM_ID until MAM_ID itself
// changes, which marks a deliberately pasted new session.
export class MamSession {
  constructor(config) { this.config = config; this.file = path.join(config.dataDir, SESSION_FILE); }
  seedHash() { return crypto.createHash('sha256').update(this.config.mamId).digest('hex').slice(0, 16); }
  async current() {
    requireMam(this.config);
    try {
      const stored = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (stored?.seed === this.seedHash() && typeof stored.mamId === 'string' && /^[^;\r\n\s]+$/.test(stored.mamId)) return stored.mamId;
    } catch { /* missing or unreadable: fall back to MAM_ID */ }
    return this.config.mamId;
  }
  async remember(response) {
    const rotated = setCookieValues(response).map((line) => line.match(/^\s*mam_id=([^;\s]+)/)?.[1]).find(Boolean);
    if (!rotated || rotated === await this.current()) return false;
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      await fs.writeFile(temp, `${JSON.stringify({ seed: this.seedHash(), mamId: rotated, updated: new Date().toISOString() })}\n`, { mode: 0o600 });
      await fs.rename(temp, this.file);
    } catch { await fs.unlink(temp).catch(() => {}); return false; }
    return true;
  }
}

function setCookieValues(response) {
  const headers = response?.headers;
  if (!headers) return [];
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const single = headers.get?.('set-cookie');
  return single ? single.split(/,(?=\s*[A-Za-z0-9_-]+=)/) : [];
}

const UNITS = { B: 1, KB: 1024, KIB: 1024, MB: 1024 ** 2, MIB: 1024 ** 2, GB: 1024 ** 3, GIB: 1024 ** 3, TB: 1024 ** 4, TIB: 1024 ** 4 };
// MAM's search reports size as text such as "837.0 KiB" or "1,018.9 KiB";
// older fixtures and other callers may pass a byte count.
export function parseSize(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  const match = String(value || '').replace(/,/g, '').trim().match(/^([\d.]+)\s*([A-Za-z]*)$/);
  if (!match) return 0;
  const factor = match[2] ? UNITS[match[2].toUpperCase()] : 1;
  return factor ? Math.round(Number.parseFloat(match[1]) * factor) : 0;
}

export function parseAuthorInfo(authorInfo) {
  if (!authorInfo) return '';
  let value = authorInfo;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return value; } }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value).map((a) => a && typeof a === 'object' && a.name ? a.name : String(a)).join(', ');
  }
  return String(value);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let value = bytes;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(1)} ${units[i]}`;
}

export function parseSearch(payload) {
  const entries = payload?.data ? (Array.isArray(payload.data) ? payload.data : Object.values(payload.data)) : [];
  return entries.map((item) => {
    const sourceId = String(item.id || '');
    if (!/^\d+$/.test(sourceId)) return null;
    const sizeRaw = parseSize(item.size);
    return { source: 'mam', sourceId, id: sourceId, title: item.title || item.name || 'Unknown', author: parseAuthorInfo(item.author_info), size: formatBytes(sizeRaw), sizeRaw, seeders: Number.parseInt(item.seeders || 0, 10) || 0, leechers: Number.parseInt(item.leechers || 0, 10) || 0, format: item.filetype || item.ext || '', category: item.cat_name || '', added: item.added || '', url: `${BASE}/t/${sourceId}` };
  }).filter(Boolean);
}

export class MamClient {
  constructor(config, fetchImpl = globalThis.fetch) { this.config = config; this.fetch = fetchImpl; this.session = new MamSession(config); }
  async request(url, init = {}) {
    const response = await this.fetch(url, { ...init, headers: { ...init.headers, Cookie: mamCookie(this.config, await this.session.current()), 'User-Agent': ua } });
    await this.session.remember(response);
    return response;
  }
  async search(query, page = 0) {
    requireMam(this.config);
    if (!query || typeof query !== 'string' || query.length > 500) throw new AppError('ARGS', 'A query up to 500 characters is required');
    if (!Number.isInteger(page) || page < 0) throw new AppError('ARGS', 'Page must be a non-negative integer');
    const params = new URLSearchParams({'tor[text]': query, 'tor[srchIn][title]': 'true', 'tor[srchIn][author]': 'true', 'tor[searchType]': 'all', 'tor[sortType]': 'seeders', 'tor[startNumber]': String(page * 25)});
    let response;
    try { response = await this.request(`${BASE}/tor/js/loadSearchJSONbasic.php?${params}`, { headers: { Accept: 'application/json' } }); }
    catch { throw new AppError('UPSTREAM', 'MAM search network request failed', { retryable: true }); }
    if (response.status === 401 || response.status === 403) throw new AppError('AUTH', 'MAM authentication failed');
    if (!response.ok) throw new AppError('UPSTREAM', `MAM search failed (${response.status})`, { retryable: response.status >= 500 });
    try { return { results: parseSearch(await response.json()) }; } catch { throw new AppError('UPSTREAM', 'MAM returned an invalid search response', { retryable: true }); }
  }
  async torrent(sourceId) {
    requireMam(this.config);
    if (!/^\d{1,12}$/.test(String(sourceId))) throw new AppError('ARGS', 'Source ID must be a numeric MAM torrent ID');
    let response;
    try { response = await this.request(`${BASE}/tor/download.php?tid=${sourceId}`, { redirect: 'follow' }); }
    catch { throw new AppError('UPSTREAM', 'MAM torrent network request failed', { retryable: true }); }
    if (response.status === 401 || response.status === 403) throw new AppError('AUTH', 'MAM authentication failed');
    if (response.status === 406) throw new AppError('UPSTREAM', `MAM refused the download: ${await refusalReason(response)}`);
    if (!response.ok) throw new AppError('UPSTREAM', `MAM torrent download failed (${response.status})`, { retryable: response.status >= 500 });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isTorrent(bytes)) throw new AppError('UPSTREAM', 'MAM returned an invalid torrent file');
    return { buffer: bytes, filename: `mam-${sourceId}.torrent` };
  }

  // MAM's dynamic seedbox API: keeps the session in use and moves the
  // session's registered IP to this host's current address, so the tracker
  // keeps accepting announces after a home IP change. MAM answers "No change"
  // when nothing moved, and rate-limits real changes to about one an hour.
  async keepalive() {
    requireMam(this.config);
    let response;
    try { response = await this.request(SEEDBOX_API, { headers: { Accept: 'application/json' } }); }
    catch { throw new AppError('UPSTREAM', 'MAM seedbox API network request failed', { retryable: true }); }
    let body = {};
    try { body = await response.json(); } catch { /* non-JSON error page */ }
    const msg = typeof body?.msg === 'string' ? body.msg.slice(0, 200) : '';
    if (body?.Success === true) return { ok: true, changed: !/no change/i.test(msg), message: msg || 'Completed', ip: typeof body.ip === 'string' ? body.ip : null, asn: body.ASN ?? null };
    if (/too recent/i.test(msg) || response.status === 429) return { ok: true, changed: false, message: msg || 'Last change too recent', ip: null, asn: null, rateLimited: true };
    if (response.status === 401 || response.status === 403 || /session|cookie|not authori[sz]ed|asn/i.test(msg)) throw new AppError('AUTH', `MAM session rejected: ${msg || response.status}`);
    throw new AppError('UPSTREAM', `MAM seedbox API failed: ${msg || response.status}`, { retryable: response.status >= 500 });
  }
}

async function refusalReason(response) {
  try {
    const text = (await response.text()).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, 200) || 'not acceptable (406)';
  } catch { return 'not acceptable (406)'; }
}

export function isTorrent(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length > 20 && bytes.length <= 1024 * 1024 && bytes[0] === 0x64 && bytes.at(-1) === 0x65 && /\d+:announce\d+:/.test(bytes.toString('latin1', 0, Math.min(bytes.length, 4096)));
}
