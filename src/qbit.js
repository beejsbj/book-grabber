import { AppError } from './errors.js';
import { requireQbit } from './config.js';

export class QbitClient {
  constructor(config, fetchImpl = globalThis.fetch) { this.config = config; this.fetch = fetchImpl; this.sid = ''; }
  headers(extra = {}) { return { ...extra, ...(this.sid ? { Cookie: this.sid } : {}) }; }
  async login() {
    requireQbit(this.config);
    const body = new URLSearchParams({ username: this.config.qbitUsername, password: this.config.qbitPassword });
    let response;
    try { response = await this.fetch(`${this.config.qbitUrl}/api/v2/auth/login`, { method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body }); }
    catch { throw new AppError('UPSTREAM', 'qBittorrent login network request failed', { retryable: true }); }
    if (!response.ok) throw new AppError('AUTH', 'qBittorrent authentication failed');
    const cookie = response.headers.get('set-cookie') || '';
    const sid = cookie.match(/(?:^|[,;]\s*)SID=([^;,\s]+)/)?.[1];
    if (sid) this.sid = `SID=${sid}`;
  }
  async request(path, options = {}) {
    requireQbit(this.config);
    let response;
    try { response = await this.fetch(`${this.config.qbitUrl}${path}`, { ...options, headers: this.headers(options.headers) }); }
    catch { throw new AppError('UPSTREAM', 'qBittorrent network request failed', { retryable: true }); }
    if (response.status === 403 && !this.sid) { await this.login(); return this.request(path, options); }
    return response;
  }
  async health() {
    const response = await this.request('/api/v2/app/version');
    if (response.status === 401 || response.status === 403) throw new AppError('AUTH', 'qBittorrent authentication failed');
    if (!response.ok) throw new AppError('UPSTREAM', `qBittorrent health check failed (${response.status})`, { retryable: response.status >= 500 });
    return { reachable: true };
  }
  async addTorrent(buffer, filename) {
    const form = new FormData();
    form.append('torrents', new Blob([buffer], { type: 'application/x-bittorrent' }), filename);
    if (this.config.dlSavePath) form.append('savepath', this.config.dlSavePath);
    const response = await this.request('/api/v2/torrents/add', { method: 'POST', body: form });
    if (!response.ok) throw new AppError('QBIT', `qBittorrent rejected torrent (${response.status})`, { retryable: response.status >= 500 });
    const text = (await response.text()).trim();
    if (text !== 'Ok' && text !== 'Ok.') throw new AppError('QBIT', 'qBittorrent rejected torrent');
    return { accepted: true };
  }
}
