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
    const record = { source: 'mam', sourceId: String(sourceId), title: normalizeMetadataValue(metadata.title), author: normalizeMetadataValue(metadata.author), format: normalizeMetadataValue(metadata.format), size: normalizeMetadataValue(metadata.size), seeders: Number(metadata.seeders) || 0, date: new Date().toISOString(), status: 'accepted' };
    await this.state.addHistory(record);
    return { accepted: true, source: 'mam', sourceId: String(sourceId) };
  }
  history() { return this.state.list('history'); }
  list(kind) { return this.state.list(kind); }
  add(kind, entry) {
    const normalized = typeof entry === 'string' ? { title: entry } : { ...entry };
    if (!normalized.title || typeof normalized.title !== 'string' || normalized.title.length > 1000) throw new AppError('ARGS', 'A title up to 1000 characters is required');
    normalized.date ||= new Date().toISOString().slice(0, 10); return this.state.add(kind, normalized);
  }
  remove(kind, selector) {
    const normalized = typeof selector === 'string' ? { title: selector } : { ...selector };
    if (!normalized.title && !Number.isInteger(normalized.index)) throw new AppError('ARGS', 'A title or index is required');
    return this.state.remove(kind, normalized);
  }
}
function normalizeMetadataValue(value) { return typeof value === 'string' ? value.slice(0, 500) : ''; }
