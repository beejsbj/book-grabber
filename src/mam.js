import { AppError } from './errors.js';
import { requireMam } from './config.js';

const BASE = 'https://www.myanonamouse.net';
const ua = 'book-grabber/1.0';

export function mamCookie(config) {
  requireMam(config);
  return `mam_id=${config.mamId}`;
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
    const sizeRaw = Number.parseInt(item.size || 0, 10) || 0;
    return { source: 'mam', sourceId, id: sourceId, title: item.title || item.name || 'Unknown', author: parseAuthorInfo(item.author_info), size: formatBytes(sizeRaw), sizeRaw, seeders: Number.parseInt(item.seeders || 0, 10) || 0, leechers: Number.parseInt(item.leechers || 0, 10) || 0, format: item.filetype || item.ext || '', category: item.cat_name || '', added: item.added || '', url: `${BASE}/t/${sourceId}` };
  }).filter(Boolean);
}

export class MamClient {
  constructor(config, fetchImpl = globalThis.fetch) { this.config = config; this.fetch = fetchImpl; }
  async search(query, page = 0) {
    requireMam(this.config);
    if (!query || typeof query !== 'string' || query.length > 500) throw new AppError('ARGS', 'A query up to 500 characters is required');
    if (!Number.isInteger(page) || page < 0) throw new AppError('ARGS', 'Page must be a non-negative integer');
    const params = new URLSearchParams({'tor[text]': query, 'tor[srchIn][title]': 'true', 'tor[srchIn][author]': 'true', 'tor[searchType]': 'all', 'tor[sortType]': 'seeders', 'tor[startNumber]': String(page * 25)});
    let response;
    try { response = await this.fetch(`${BASE}/tor/js/loadSearchJSONbasic.php?${params}`, { headers: { Cookie: mamCookie(this.config), 'User-Agent': ua, Accept: 'application/json' } }); }
    catch { throw new AppError('UPSTREAM', 'MAM search network request failed', { retryable: true }); }
    if (response.status === 401 || response.status === 403) throw new AppError('AUTH', 'MAM authentication failed');
    if (!response.ok) throw new AppError('UPSTREAM', `MAM search failed (${response.status})`, { retryable: response.status >= 500 });
    try { return { results: parseSearch(await response.json()) }; } catch { throw new AppError('UPSTREAM', 'MAM returned an invalid search response', { retryable: true }); }
  }
  async torrent(sourceId) {
    requireMam(this.config);
    if (!/^\d{1,12}$/.test(String(sourceId))) throw new AppError('ARGS', 'Source ID must be a numeric MAM torrent ID');
    let response;
    try { response = await this.fetch(`${BASE}/tor/download.php?tid=${sourceId}`, { headers: { Cookie: mamCookie(this.config), 'User-Agent': ua }, redirect: 'follow' }); }
    catch { throw new AppError('UPSTREAM', 'MAM torrent network request failed', { retryable: true }); }
    if (response.status === 401 || response.status === 403) throw new AppError('AUTH', 'MAM authentication failed');
    if (!response.ok) throw new AppError('UPSTREAM', `MAM torrent download failed (${response.status})`, { retryable: response.status >= 500 });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isTorrent(bytes)) throw new AppError('UPSTREAM', 'MAM returned an invalid torrent file');
    return { buffer: bytes, filename: `mam-${sourceId}.torrent` };
  }
}

export function isTorrent(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length > 20 && bytes.length <= 1024 * 1024 && bytes[0] === 0x64 && bytes.at(-1) === 0x65 && /\d+:announce\d+:/.test(bytes.toString('latin1', 0, Math.min(bytes.length, 4096)));
}
