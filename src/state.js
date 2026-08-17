import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';

const files = Object.freeze({ history: 'downloads-history.json', queue: 'books-wanted.md', notFound: 'books-not-found.md', failed: 'books-failed.md' });
const headings = Object.freeze({ queue: '# Wanted Books\n\n', notFound: '# Books Not Found on MAM\n\n', failed: '# Failed Downloads\n\n' });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class StateStore {
  constructor(dataDir) { this.dataDir = dataDir; this.lockPath = path.join(dataDir, '.book-grabber.lock'); }
  file(kind) { return path.join(this.dataDir, files[kind]); }
  async withLock(work) {
    try { await fs.mkdir(this.dataDir, { recursive: true }); } catch (cause) { throw new AppError('STATE', 'Unable to create state directory', { cause }); }
    let handle;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try { handle = await fs.open(this.lockPath, 'wx'); await handle.writeFile(String(process.pid)); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw new AppError('STATE', 'Unable to acquire state lock', { cause: error });
        await this.clearDeadLock(); await delay(25 + Math.floor(Math.random() * 20));
      }
    }
    if (!handle) throw new AppError('STATE', 'State lock is busy', { retryable: true });
    try { return await work(); }
    catch (error) { if (error instanceof AppError) throw error; throw new AppError('STATE', 'State operation failed', { cause: error }); }
    finally { await handle.close().catch(() => {}); await fs.unlink(this.lockPath).catch(() => {}); }
  }
  async clearDeadLock() {
    let pid;
    try { pid = Number.parseInt((await fs.readFile(this.lockPath, 'utf8')).trim(), 10); } catch { return; }
    if (!Number.isInteger(pid) || pid <= 1) return;
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') await fs.unlink(this.lockPath).catch(() => {}); }
  }
  async readJson() {
    try { const parsed = JSON.parse(await fs.readFile(this.file('history'), 'utf8')); return Array.isArray(parsed) ? parsed : []; }
    catch (error) { if (error.code === 'ENOENT') return []; if (error instanceof SyntaxError) throw new AppError('STATE', 'State history is not valid JSON', { cause: error }); throw new AppError('STATE', 'Unable to read state history', { cause: error }); }
  }
  async readMarkdown(kind) {
    try { return await fs.readFile(this.file(kind), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return headings[kind]; throw new AppError('STATE', 'Unable to read state list', { cause: error }); }
  }
  parseItems(kind, markdown) {
    return markdown.split(/\r?\n/).map((line, lineIndex) => ({ line, lineIndex, item: parseMarkdownItem(kind, line) })).filter(({ item }) => item !== null);
  }
  async list(kind) {
    if (kind === 'history') return this.readJson();
    const markdown = await this.readMarkdown(kind);
    return this.parseItems(kind, markdown).map(({ item }) => item);
  }
  async atomicWrite(target, text) {
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try { await fs.writeFile(temp, text, { mode: 0o600 }); await fs.rename(temp, target); }
    catch (cause) { throw new AppError('STATE', 'Unable to write state', { cause }); }
  }
  async addHistory(record) {
    return this.withLock(async () => { const records = await this.readJson(); records.unshift(record); await this.atomicWrite(this.file('history'), `${JSON.stringify(records, null, 2)}\n`); return record; });
  }
  async add(kind, entry) {
    return this.withLock(async () => {
      const existing = await this.readMarkdown(kind);
      const line = formatMarkdownItem(kind, entry);
      const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
      await this.atomicWrite(this.file(kind), `${existing}${separator}${line}\n`);
      return parseMarkdownItem(kind, line);
    });
  }
  async remove(kind, selector) {
    return this.withLock(async () => {
      const markdown = await this.readMarkdown(kind); const lines = markdown.split(/\r?\n/); const parsed = this.parseItems(kind, markdown);
      const selected = Number.isInteger(selector.index) ? parsed[selector.index] : parsed.find(({ item }) => item.title === selector.title || item.text === selector.title);
      if (!selected) throw new AppError('ARGS', 'Entry was not found');
      lines.splice(selected.lineIndex, 1); await this.atomicWrite(this.file(kind), lines.join('\n'));
      return { removed: selected.item, remaining: parsed.length - 1 };
    });
  }
}

function parseMarkdownItem(kind, line) {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('- ')) return null;
  const body = trimmed.slice(2);
  if (kind === 'queue') {
    const checkbox = body.match(/^\[([ xX])\]\s*(.*)$/);
    return checkbox ? { text: checkbox[2].trim(), done: checkbox[1].toLowerCase() === 'x' } : { text: body.trim(), done: false };
  }
  const parts = body.split(' | ').map((part) => part.trim());
  if (kind === 'notFound') return { title: parts[0] || '', author: parts[1] || '', link: parts[2] || '', date: parts[3] || '' };
  if (kind === 'failed') return { title: parts[0] || '', author: parts[1] || '', torrentId: parts[2] || '', error: parts[3] || '', date: parts[4] || '' };
  return null;
}

function formatMarkdownItem(kind, entry) {
  const safe = (value) => String(value || '').replace(/[\r\n|]+/g, ' ').trim();
  if (kind === 'queue') return `- [ ] ${safe(entry.title || entry.text)}${entry.notes ? ` — ${safe(entry.notes)}` : ''}`;
  if (kind === 'notFound') return `- ${safe(entry.title)} | ${safe(entry.author)} | ${safe(entry.link)} | ${safe(entry.date)}`;
  if (kind === 'failed') return `- ${safe(entry.title)} | ${safe(entry.author)} | ${safe(entry.torrentId)} | ${safe(entry.error)} | ${safe(entry.date)}`;
  throw new AppError('ARGS', 'Unsupported state list');
}
