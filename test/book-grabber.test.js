import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
test('state retains legacy markdown and serializes concurrent writes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'book-grabber-state-')); const state = new StateStore(dir); await fs.writeFile(path.join(dir, 'books-wanted.md'), '- Existing item\n');
  await Promise.all(Array.from({ length: 12 }, (_, i) => state.add('queue', `item ${i}`))); const values = await state.list('queue'); assert.equal(values.length, 13); assert.equal(values[0], 'Existing item'); await state.add('history', { sourceId: '1' }); assert.deepEqual(await state.list('history'), [{ sourceId: '1' }]); await fs.writeFile(path.join(dir, '.book-grabber.lock'), '99999999'); await state.add('queue', 'after stale lock'); assert.equal((await state.list('queue')).at(-1), 'after stale lock');
});
test('CLI emits one envelope and maps argument errors', async () => {
  const lines = []; const fake = { health: async () => ({ good: true }) }; const code = await runCli(['health', '--json'], { operations: fake, out: (x) => lines.push(x), err: () => {} }); assert.equal(code, 0); assert.deepEqual(JSON.parse(lines[0]), { schemaVersion: '1', ok: true, command: 'health', data: { good: true } });
  const bad = []; const badCode = await runCli(['search', '--json'], { operations: fake, out: (x) => bad.push(x), err: () => {} }); assert.equal(badCode, 2); assert.equal(JSON.parse(bad[0]).error.code, 'ARGS');
  const configFail = []; const configCode = await runCli(['health', '--json'], { operations: { health: async () => { throw new AppError('CONFIG', 'missing'); } }, out: (x) => configFail.push(x), err: () => {} }); assert.equal(configCode, 3); assert.equal(configFail.length, 1); assert.equal(JSON.parse(configFail[0]).ok, false);
});
test('web keeps unauthenticated liveness and protects detailed routes', async () => {
  const cfg = config({ AUTH_USER: 'u', AUTH_PASS: 'p' }); const ops = { health: async () => ({ checked: true }), search: async () => ({ total: 0 }), history: async () => [] }; const app = createApp(ops, cfg); const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); const root = `http://127.0.0.1:${server.address().port}`; const auth = { Authorization: `Basic ${Buffer.from('u:p').toString('base64')}` };
  try { assert.equal((await fetch(`${root}/api/health`)).status, 200); assert.equal((await fetch(`${root}/api/health?detail=1`)).status, 401); assert.deepEqual(await (await fetch(`${root}/api/health?detail=1`, { headers: auth })).json(), { checked: true }); assert.equal((await fetch(`${root}/api/search?q=x`, { headers: auth })).status, 200); assert.equal((await fetch(`${root}/api/downloads`, { headers: auth })).status, 200); } finally { await new Promise((resolve) => server.close(resolve)); }
});
test('bind validation rejects wildcard and unauthenticated non-loopback', () => {
  assert.throws(() => validateBind('0.0.0.0', config()), AppError); assert.throws(() => validateBind('100.64.2.3', config(), { eth0: [{ address: '100.64.2.3' }] }), AppError);
});
