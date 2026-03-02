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

const parseTidbUrl = (urlStr) => {
  try {
    const u = new URL(String(urlStr));
    const protocol = (u.protocol || '').toLowerCase();
    const sslFromProtocol = protocol === 'mysqls:';
    const sslParam = u.searchParams.get('ssl') ?? u.searchParams.get('tls');
    const sslEnabled = sslFromProtocol || toBool(sslParam);

    const database = (u.pathname || '').replace(/^\//, '');

    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : undefined,
      user: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      database: database || undefined,
      sslEnabled,
    };
  } catch {
    return null;
  }
};

let _pool = null;

export const getPool = () => {
  if (_pool) return _pool;

  const urlCfg = parseTidbUrl(env('TIDB_URL', ''));
  const sslEnabled = urlCfg?.sslEnabled ?? toBool(env('TIDB_SSL', 'true'));
  const caB64 = env('TIDB_SSL_CA_BASE64', '');
  const ca = caB64 ? decodeBase64ToUtf8(caB64) : null;

  const host = urlCfg?.host || env('TIDB_HOST', '127.0.0.1');
  const port = Number(urlCfg?.port || env('TIDB_PORT', '4000'));
  const user = urlCfg?.user || env('TIDB_USER', 'root');
  const password = urlCfg?.password ?? env('TIDB_PASSWORD', '');
  const database = urlCfg?.database || env('TIDB_DATABASE', 'budget_monitoring');

  // On Vercel, a fallback to localhost almost always means env vars were not set.
  // Fail fast with a clear message (instead of ECONNREFUSED 127.0.0.1:4000).
  const isVercel = toBool(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
  const isLocalHost = String(host).toLowerCase() === '127.0.0.1' || String(host).toLowerCase() === 'localhost';
  const hasUrl = Boolean(env('TIDB_URL', ''));
  const hasHostVar = Boolean(process.env.TIDB_HOST);
  if (isVercel && isLocalHost && !hasUrl && !hasHostVar) {
    throw new Error(
      'TiDB belum dikonfigurasi di Vercel. Set Environment Variable TIDB_URL (recommended) ' +
        'atau TIDB_HOST/TIDB_USER/TIDB_PASSWORD/TIDB_DATABASE. Saat ini fallback ke 127.0.0.1:4000.'
    );
  }

  /** @type {import('mysql2/promise').PoolOptions} */
  const cfg = {
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 10,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
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

  _pool = mysql.createPool(cfg);
  return _pool;
};
