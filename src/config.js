import os from 'node:os';
import path from 'node:path';
import { AppError } from './errors.js';

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || './data');
  return {
    mamId: env.MAM_ID || '',
    qbitUrl: env.QBIT_URL || '',
    qbitUsername: env.QBIT_USERNAME || '',
    qbitPassword: env.QBIT_PASSWORD || '',
    dataDir,
    dlSavePath: env.DL_SAVE_PATH || '',
    authUser: env.AUTH_USER || '',
    authPass: env.AUTH_PASS || ''
  };
}

export function requireMam(config) {
  if (!config.mamId) throw new AppError('CONFIG', 'MAM_ID is required');
  if (!/^[^;\r\n\s]+$/.test(config.mamId)) throw new AppError('CONFIG', 'MAM_ID contains invalid cookie characters');
}

export function requireQbit(config) {
  if (!config.qbitUrl) throw new AppError('CONFIG', 'QBIT_URL is required');
  try {
    const url = new URL(config.qbitUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch {
    throw new AppError('CONFIG', 'QBIT_URL must be an http(s) URL without embedded credentials');
  }
}

export function validateBind(host, config, interfaces = os.networkInterfaces()) {
  if (host === '0.0.0.0' || host === '::' || host === '::0') {
    throw new AppError('CONFIG', 'Wildcard binds are not permitted');
  }
  if (host === '127.0.0.1' || host === '::1' || host === 'localhost') return;
  const assigned = Object.values(interfaces).flat().some((entry) => entry?.address === host);
  const cgnat = /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(host);
  if (!assigned || !cgnat) throw new AppError('CONFIG', 'Non-loopback bind must be an assigned 100.64.0.0/10 address');
  if (!config.authUser || !config.authPass) throw new AppError('CONFIG', 'AUTH_USER and AUTH_PASS are required for non-loopback binds');
}
