#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config.js';
import { Operations } from '../src/operations.js';
import { serve } from '../src/web.js';
import { AppError, asAppError, exitCodes } from '../src/errors.js';

const version = '1.0.0';
const help = `book-grabber ${version}

Usage:
  book-grabber health --json
  book-grabber search <query> [--page N] --json
  book-grabber grab <source-id> --json
  book-grabber history --json
  book-grabber queue list|add --json
  book-grabber not-found list|add|remove --json
  book-grabber failed list|remove --json
  book-grabber serve [--host IP] [--port PORT]
  book-grabber --help | --version`;
function envelope(ok, command, data, error) { return ok ? { schemaVersion: '1', ok: true, command, data } : { schemaVersion: '1', ok: false, command, error: { code: error.code, message: error.message, retryable: error.retryable } }; }
function argument(argv, name) { const index = argv.indexOf(name); return index === -1 ? undefined : argv[index + 1]; }
function requireJson(argv) { if (!argv.includes('--json')) throw new AppError('ARGS', '--json is required for non-interactive commands'); }
async function waitForListener(server) {
  if (server.listening) return server;
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return server;
}
export async function runCli(argv = process.argv.slice(2), { config = loadConfig(), operations = new Operations(config), out = console.log, err = console.error, serveImpl = serve } = {}) {
  const command = argv[0] || 'unknown';
  try {
    if (command === '--help' || command === '-h' || command === 'help') { out(help); return 0; }
    if (command === '--version' || command === '-v' || command === 'version') { out(version); return 0; }
    if (command === 'serve') {
      const host = argument(argv, '--host') || '127.0.0.1'; const requestedPort = Number(argument(argv, '--port') || 3000);
      let server; try { server = await waitForListener(serveImpl(operations, config, { host, port: requestedPort })); } catch (cause) { if (cause instanceof AppError) throw cause; throw new AppError('CONFIG', 'Unable to bind web server', { cause }); }
      const address = server.address(); out(JSON.stringify(envelope(true, command, { host: typeof address === 'object' ? address.address : host, port: typeof address === 'object' ? address.port : requestedPort }))); return 0;
    }
    requireJson(argv); let data;
    if (command === 'health') data = await operations.health();
    else if (command === 'search') { if (!argv[1] || argv[1].startsWith('--')) throw new AppError('ARGS', 'Search query is required'); const page = Number(argument(argv, '--page') || 0); if (!Number.isInteger(page) || page < 0) throw new AppError('ARGS', 'Page must be a non-negative integer'); data = await operations.search(argv[1], page); }
    else if (command === 'grab') { if (!argv[1] || argv[1].startsWith('--')) throw new AppError('ARGS', 'Source ID is required'); data = await operations.grab(argv[1]); }
    else if (command === 'history') data = await operations.history();
    else if (['queue', 'not-found', 'failed'].includes(command)) { const action = argv[1]; const kind = command === 'not-found' ? 'notFound' : command; if (action === 'list') data = await operations.list(kind); else if (action === 'add' && kind !== 'failed') data = await operations.add(kind, argv.slice(2).filter((x) => x !== '--json').join(' ')); else if (action === 'remove' && kind !== 'queue') data = await operations.remove(kind, argv.slice(2).filter((x) => x !== '--json').join(' ')); else throw new AppError('ARGS', 'Unsupported list operation'); }
    else throw new AppError('ARGS', 'Unknown command');
    out(JSON.stringify(envelope(true, command, data))); return 0;
  } catch (error) { const appError = asAppError(error); out(JSON.stringify(envelope(false, command, null, appError))); if (appError.code === 'INTERNAL') err('book-grabber: internal error'); return exitCodes[appError.code] || exitCodes.INTERNAL; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) runCli().then((code) => { process.exitCode = code; });
