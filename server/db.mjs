import mysql from 'mysql2/promise';

const env = (k, fallback = undefined) => {
  const v = process.env[k];
  return v === undefined || v === '' ? fallback : v;
};

const toBool = (v) => {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on';
};

const decodeBase64ToUtf8 = (b64) => {
  try {
    return Buffer.from(String(b64), 'base64').toString('utf8');
  } catch {
    return null;
  }
};

export const createPool = () => {
  const sslEnabled = toBool(env('TIDB_SSL', 'false'));
  const caB64 = env('TIDB_SSL_CA_BASE64', '');
  const ca = caB64 ? decodeBase64ToUtf8(caB64) : null;

  /** @type {import('mysql2/promise').PoolOptions} */
  const cfg = {
    host: env('TIDB_HOST', '127.0.0.1'),
    port: Number(env('TIDB_PORT', '4000')),
    user: env('TIDB_USER', 'root'),
    password: env('TIDB_PASSWORD', ''),
    database: env('TIDB_DATABASE', 'budget_monitoring'),
    connectionLimit: 10,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    namedPlaceholders: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
  };

  if (sslEnabled) {
    cfg.ssl = {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    };
  }

  return mysql.createPool(cfg);
};
