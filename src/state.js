import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';

const names = Object.freeze({ history: 'downloads-history.json', queue: 'books-wanted.md', notFound: 'books-not-found.md', failed: 'books-failed.md' });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class StateStore {
  constructor(dataDir) { this.dataDir = dataDir; this.lockPath = path.join(dataDir, '.book-grabber.lock'); }
  file(kind) { return path.join(this.dataDir, names[kind]); }
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
  async readJson(kind) {
    try { const parsed = JSON.parse(await fs.readFile(this.file(kind), 'utf8')); return Array.isArray(parsed) ? parsed : []; }
    catch (error) { if (error.code === 'ENOENT') return []; if (error instanceof SyntaxError) throw new AppError('STATE', 'State history is not valid JSON', { cause: error }); throw new AppError('STATE', 'Unable to read state history', { cause: error }); }
  }
  async readLines(kind) {
    try { return (await fs.readFile(this.file(kind), 'utf8')).split(/\r?\n/).filter((line) => line.startsWith('- ')).map((line) => line.slice(2)); }
    catch (error) { if (error.code === 'ENOENT') return []; throw new AppError('STATE', 'Unable to read state list', { cause: error }); }
  }
  async atomicWrite(kind, value) {
    const target = this.file(kind); const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    const text = kind === 'history' ? `${JSON.stringify(value, null, 2)}\n` : value.map((entry) => `- ${String(entry).replace(/[\r\n]+/g, ' ').trim()}`).join('\n') + (value.length ? '\n' : '');
    try { await fs.writeFile(temp, text, { mode: 0o600 }); await fs.rename(temp, target); }
    catch (cause) { throw new AppError('STATE', 'Unable to write state', { cause }); }
  }
  async list(kind) { return kind === 'history' ? this.readJson(kind) : this.readLines(kind); }
  async add(kind, entry) { return this.withLock(async () => { const rows = await this.list(kind); rows.push(entry); await this.atomicWrite(kind, rows); return entry; }); }
  async remove(kind, entry) { return this.withLock(async () => { const rows = await this.list(kind); const filtered = rows.filter((row) => row !== entry); if (filtered.length === rows.length) throw new AppError('ARGS', 'Entry was not found'); await this.atomicWrite(kind, filtered); return entry; }); }
}
