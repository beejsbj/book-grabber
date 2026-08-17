import { AppError } from './errors.js';
import { requireQbit } from './config.js';
import { MamClient } from './mam.js';
import { QbitClient } from './qbit.js';
import { StateStore } from './state.js';

export class Operations {
  constructor(config, { fetchImpl } = {}) {
    this.config = config;
    this.mam = new MamClient(config, fetchImpl);
    this.qbit = new QbitClient(config, fetchImpl);
    this.state = new StateStore(config.dataDir);
  }
  async health() { requireQbit(this.config); const qbit = await this.qbit.health(); return { mamConfigured: Boolean(this.config.mamId), qbit, dataDir: this.config.dataDir }; }
  async search(query, page = 0) { const found = await this.mam.search(query, page); return { query, page, total: found.results.length, results: found.results }; }
  async grab(sourceId, metadata = {}) {
    requireQbit(this.config);
    const torrent = await this.mam.torrent(sourceId);
    await this.qbit.addTorrent(torrent.buffer, torrent.filename);
    const record = { source: 'mam', sourceId: String(sourceId), title: clean(metadata.title), author: clean(metadata.author), format: clean(metadata.format), size: clean(metadata.size), seeders: Number(metadata.seeders) || 0, date: new Date().toISOString(), status: 'accepted' };
    await this.state.add('history', record);
    return { accepted: true, source: 'mam', sourceId: String(sourceId) };
  }
  history() { return this.state.list('history'); }
  list(kind) { return this.state.list(kind); }
  add(kind, entry) { if (!entry || typeof entry !== 'string' || entry.length > 1000) throw new AppError('ARGS', 'A list entry up to 1000 characters is required'); return this.state.add(kind, entry.trim()); }
  remove(kind, entry) { if (!entry || typeof entry !== 'string') throw new AppError('ARGS', 'An entry is required'); return this.state.remove(kind, entry); }
}
function clean(value) { return typeof value === 'string' ? value.slice(0, 500) : ''; }
