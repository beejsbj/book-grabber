import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, asAppError } from './errors.js';
import { validateBind } from './config.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
function basicAuth(config) {
  return (req, res, next) => {
    if (!config.authUser || !config.authPass) return next();
    const value = req.headers.authorization || ''; const encoded = value.startsWith('Basic ') ? value.slice(6) : '';
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    if (user === config.authUser && pass === config.authPass) return next();
    res.set('WWW-Authenticate', 'Basic realm="book-grabber"'); return res.status(401).json({ error: { code: 'AUTH', message: 'Authentication required' } });
  };
}
function route(handler) { return async (req, res) => { try { res.json(await handler(req, res)); } catch (error) { const appError = asAppError(error); res.status(status(appError)).json({ error: { code: appError.code, message: appError.message, retryable: appError.retryable } }); } }; }
function status(error) { return error.code === 'ARGS' ? 400 : error.code === 'AUTH' ? 401 : error.code === 'CONFIG' ? 503 : error.code === 'STATE' ? 500 : 502; }
export function createApp(operations, config) {
  const app = express(); app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (req, res, next) => req.query.detail === '1' ? next() : res.json({ ok: true, live: true }));
  app.get('/api/health', basicAuth(config), route(() => operations.health()));
  app.use('/api', basicAuth(config));
  app.get('/api/search', route((req) => operations.search(req.query.q || '', Number(req.query.page || 0))));
  app.post('/api/download', route((req) => operations.grab(req.body?.sourceId || req.body?.torrentId, req.body || {})));
  app.get('/api/status', route(() => operations.history()));
  app.get('/api/downloads', route(() => operations.history()));
  app.get('/api/queue', route(() => operations.list('queue')));
  app.post('/api/queue', route((req) => operations.add('queue', req.body?.entry || req.body?.title)));
  app.get('/api/not-found', route(() => operations.list('notFound')));
  app.post('/api/not-found', route((req) => operations.add('notFound', req.body?.entry || req.body?.title)));
  app.delete('/api/not-found', route((req) => operations.remove('notFound', req.body?.entry)));
  app.get('/api/failed', route(() => operations.list('failed')));
  app.delete('/api/failed', route((req) => operations.remove('failed', req.body?.entry)));
  app.use(express.static(publicDir));
  return app;
}
export function serve(operations, config, { host = '127.0.0.1', port = 3000 } = {}) {
  validateBind(host, config); if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new AppError('ARGS', 'Port must be between 1 and 65535');
  return createApp(operations, config).listen(Number(port), host);
}
