import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { loadConfig, validateBind } from '../src/config.js';
import { AppError } from '../src/errors.js';
import { mamCookie, parseSearch, MamClient } from '../src/mam.js';
import { QbitClient } from '../src/qbit.js';
import { StateStore } from '../src/state.js';
import { Operations } from '../src/operations.js';
import { runCli } from '../bin/book-grabber.js';
import { createApp } from '../src/web.js';

const config = (extra = {}) => loadConfig({ MAM_ID: 'session-value', QBIT_URL: 'http://qbit.test', DATA_DIR: path.join(os.tmpdir(), `book-grabber-${Date.now()}-${Math.random()}`), ...extra });
test('MAM parser normalizes source and accepts object/string author info', () => {
  const [book] = parseSearch({ data: { x: { id: 12, title: 'A Book', author_info: '{"7":{"name":"Author"}}', size: 2048, seeders: 4, filetype: 'epub' } } });
  assert.deepEqual({ source: book.source, sourceId: book.sourceId, author: book.author, size: book.size }, { source: 'mam', sourceId: '12', author: 'Author', size: '2.0 KB' });
});
test('MAM cookie is exactly mam_id and search sends it alone', async () => {
  const calls = []; const cfg = config(); const client = new MamClient(cfg, async (_url, init) => { calls.push(init); return new Response(JSON.stringify({ data: [] }), { headers: { 'Content-Type': 'application/json' } }); });
  assert.equal(mamCookie(cfg), 'mam_id=session-value'); await client.search('book'); assert.equal(calls[0].headers.Cookie, 'mam_id=session-value'); assert.equal(Object.keys(calls[0].headers).includes('Cookie'), true);
});
test('MAM search uses the compatible query parameters without touching the network', async () => {
  let seen = ''; const client = new MamClient(config(), async (url) => { seen = url; return new Response(JSON.stringify({ data: [{ id: 9, name: 'Result' }] })); });
  const result = await client.search('hello world', 2); assert.equal(result.results[0].sourceId, '9'); assert.match(seen, /tor%5BstartNumber%5D=50/); assert.match(seen, /tor%5Btext%5D=hello\+world/);
});
test('qBittorrent logs in after 403 and adds a torrent', async () => {
  const seen = []; let stage = 0; const qbit = new QbitClient(config(), async (url, init = {}) => { seen.push({ url, init }); stage += 1; if (stage === 1) return new Response('', { status: 403 }); if (stage === 2) return new Response('Ok.', { headers: { 'set-cookie': 'SID=abc; HttpOnly' } }); return new Response('Ok.'); });
  await qbit.addTorrent(Buffer.from('d8:announce4:test4:infodee'), 'a.torrent'); assert.match(seen[1].init.body.toString(), /username=/); assert.equal(seen[2].init.headers.Cookie, 'SID=abc');
});
test('qBittorrent rejects an empty add acknowledgement', async () => {
  const qbit = new QbitClient(config(), async () => new Response(''));
  await assert.rejects(() => qbit.addTorrent(Buffer.from('d8:announce4:test4:infodee'), 'a.torrent'), (error) => error.code === 'QBIT');
  const lowercase = new QbitClient(config(), async () => new Response('ok'));
  await assert.rejects(() => lowercase.addTorrent(Buffer.from('d8:announce4:test4:infodee'), 'a.torrent'), (error) => error.code === 'QBIT');
});
test('state preserves realistic legacy markdown prefixes, checkbox syntax, and pipe fields', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'book-grabber-legacy-')); const state = new StateStore(dir);
  const queueFixture = '# Wanted Books\n\nAdd manually curated titles below.\n\n- [ ] Dune — hardcover\n- [x] A Wizard of Earthsea\n';
  const notFoundFixture = '# Books Not Found on MAM\n\nImported from the reading list.\n\n- The Dispossessed | Ursula K. Le Guin | https://example.test/book | 2026-08-01\n';
  const failedFixture = '# Failed Downloads\n\nKeep these for retry.\n\n- Kindred | Octavia Butler | 31415 | qBittorrent rejected torrent | 2026-08-02\n';
  await fs.writeFile(path.join(dir, 'books-wanted.md'), queueFixture); await fs.writeFile(path.join(dir, 'books-not-found.md'), notFoundFixture); await fs.writeFile(path.join(dir, 'books-failed.md'), failedFixture);
  assert.deepEqual(await state.list('queue'), [{ text: 'Dune — hardcover', done: false }, { text: 'A Wizard of Earthsea', done: true }]);
  await state.add('queue', { title: 'Parable of the Sower', notes: 'ebook' }); assert.equal((await fs.readFile(path.join(dir, 'books-wanted.md'), 'utf8')).startsWith(queueFixture), true);
  assert.deepEqual((await state.list('notFound'))[0], { title: 'The Dispossessed', author: 'Ursula K. Le Guin', link: 'https://example.test/book', date: '2026-08-01' });
  await state.add('notFound', { title: 'Beloved', author: 'Toni Morrison', link: 'https://example.test/beloved', date: '2026-08-03' }); await state.remove('notFound', { index: 1 }); assert.equal(await fs.readFile(path.join(dir, 'books-not-found.md'), 'utf8'), notFoundFixture);
  assert.deepEqual((await state.list('failed'))[0], { title: 'Kindred', author: 'Octavia Butler', torrentId: '31415', error: 'qBittorrent rejected torrent', date: '2026-08-02' }); await state.add('failed', { title: 'Neuromancer', author: 'William Gibson', torrentId: '2718', error: 'network', date: '2026-08-04' }); await state.remove('failed', { title: 'Neuromancer' }); assert.equal(await fs.readFile(path.join(dir, 'books-failed.md'), 'utf8'), failedFixture);
});
test('state serializes concurrent mutations, recovers a dead lock, and writes history atomically', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'book-grabber-state-')); const state = new StateStore(dir);
  await Promise.all(Array.from({ length: 12 }, (_, index) => state.add('queue', { title: `item ${index}` }))); assert.equal((await state.list('queue')).length, 12); await state.addHistory({ sourceId: '1' }); assert.deepEqual(await state.list('history'), [{ sourceId: '1' }]); await fs.writeFile(path.join(dir, '.book-grabber.lock'), '99999999'); await state.add('queue', { title: 'after stale lock' }); assert.equal((await state.list('queue')).at(-1).text, 'after stale lock');
});
test('CLI emits one envelope and maps argument errors', async () => {
  const lines = []; const fake = { health: async () => ({ good: true }) }; const code = await runCli(['health', '--json'], { operations: fake, out: (x) => lines.push(x), err: () => {} }); assert.equal(code, 0); assert.deepEqual(JSON.parse(lines[0]), { schemaVersion: '1', ok: true, command: 'health', data: { good: true } });
  const bad = []; const badCode = await runCli(['search', '--json'], { operations: fake, out: (x) => bad.push(x), err: () => {} }); assert.equal(badCode, 2); assert.equal(JSON.parse(bad[0]).error.code, 'ARGS');
  const configFail = []; const configCode = await runCli(['health', '--json'], { operations: { health: async () => { throw new AppError('CONFIG', 'missing'); } }, out: (x) => configFail.push(x), err: () => {} }); assert.equal(configCode, 3); assert.equal(configFail.length, 1); assert.equal(JSON.parse(configFail[0]).ok, false);
  const helpLines = []; assert.equal(await runCli(['--help'], { operations: fake, out: (line) => helpLines.push(line), err: () => {} }), 0); assert.match(helpLines[0], /Usage:/);
});
test('serve emits one JSON envelope only after a listener binds and maps bind errors', async () => {
  const fakeOperations = {}; const stdout = []; const stderr = []; const fakeServer = new EventEmitter(); fakeServer.listening = false; fakeServer.address = () => ({ address: '127.0.0.1', port: 3210 });
  const serveImpl = () => { queueMicrotask(() => { fakeServer.listening = true; fakeServer.emit('listening'); }); return fakeServer; };
  assert.equal(await runCli(['serve', '--port', '3210'], { operations: fakeOperations, out: (line) => stdout.push(line), err: (line) => stderr.push(line), serveImpl }), 0); assert.equal(stdout.length, 1); assert.equal(stderr.length, 0); assert.deepEqual(JSON.parse(stdout[0]).data, { host: '127.0.0.1', port: 3210 });
  const failingServer = new EventEmitter(); failingServer.listening = false; const failedOutput = []; const failingServe = () => { queueMicrotask(() => failingServer.emit('error', Object.assign(new Error('busy'), { code: 'EADDRINUSE' }))); return failingServer; }; assert.equal(await runCli(['serve'], { operations: fakeOperations, out: (line) => failedOutput.push(line), err: () => {}, serveImpl: failingServe }), 3); assert.equal(JSON.parse(failedOutput[0]).error.code, 'CONFIG');
  const argumentOutput = []; const argumentFailure = () => { throw new AppError('ARGS', 'bad port'); }; assert.equal(await runCli(['serve'], { operations: fakeOperations, out: (line) => argumentOutput.push(line), err: () => {}, serveImpl: argumentFailure }), 2); assert.equal(JSON.parse(argumentOutput[0]).error.code, 'ARGS');
});
test('web keeps liveness public, protects root, and preserves legacy response shapes', async () => {
  const cfg = config({ AUTH_USER: 'u', AUTH_PASS: 'p' }); const calls = []; const ops = { health: async () => ({ checked: true }), search: async () => ({ total: 0, results: [] }), history: async () => [{ title: 'Dune' }], list: async (kind) => kind === 'queue' ? [{ text: 'Dune', done: false }] : [], add: async (kind, body) => { calls.push({ kind, body }); return body; }, remove: async (kind, body) => ({ removed: { kind, ...body }, remaining: 0 }) }; const app = createApp(ops, cfg); const server = await new Promise((resolve) => { const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer)); }); const root = `http://127.0.0.1:${server.address().port}`; const auth = { Authorization: `Basic ${Buffer.from('u:p').toString('base64')}` };
  try {
    assert.equal((await fetch(`${root}/api/health`)).status, 200); assert.equal((await fetch(`${root}/api/health?detail=1`)).status, 401); assert.equal((await fetch(root)).status, 401); const authorizedRoot = await fetch(root, { headers: auth }); assert.equal(authorizedRoot.status, 200); assert.match(await authorizedRoot.text(), /Book Grabber/);
    assert.deepEqual(await (await fetch(`${root}/api/downloads`, { headers: auth })).json(), { downloads: [{ title: 'Dune' }] }); assert.deepEqual(await (await fetch(`${root}/api/queue`, { headers: auth })).json(), { items: [{ text: 'Dune', done: false }] });
    const queueResponse = await fetch(`${root}/api/queue`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Kindred', notes: 'audio' }) }); assert.equal(queueResponse.status, 200); assert.deepEqual(calls[0], { kind: 'queue', body: { title: 'Kindred', notes: 'audio' } });
    const removed = await fetch(`${root}/api/not-found`, { method: 'DELETE', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 0 }) }); assert.equal(removed.status, 200); assert.equal((await removed.json()).remaining, 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
test('bind validation rejects wildcard and unauthenticated non-loopback', () => {
  assert.throws(() => validateBind('0.0.0.0', config()), AppError); assert.throws(() => validateBind('100.64.2.3', config(), { eth0: [{ address: '100.64.2.3' }] }), AppError);
});
