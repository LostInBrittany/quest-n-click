// The Studio Server's configuration (4.2.1, plan §4 and ADR 0027): a JSON file for what is not secret, and the
// secrets each from a file (`<NAME>_FILE`, mode 0600, preferred) or from the environment (Clever Cloud injects add-on
// credentials as variables). A secret read from the environment is then removed from `process.env`, so no child
// process ever inherits it; no secret is ever logged; a value that is not text, or too short, is refused at start.
import { readFileSync, statSync } from 'node:fs';

interface StoreConfig {
  kind: 'sqlite' | 'postgres';
  /** sqlite: the database file. */
  file?: string;
}

interface BlobsConfig {
  kind: 'fs' | 's3';
  /** fs: the folder. */
  dir?: string;
  /** s3 (Cellar): the endpoint host and the bucket; the keys are secrets. */
  host?: string;
  bucket?: string;
}

export interface StudioServerConfig {
  /** The Studio's public origin (`https://studio.example.fr`): the only `Origin` a cookie mutation may carry. */
  publicUrl: string;
  /** The game's origin (plan §6.1): previews and builds are served there, never on `publicUrl`. */
  playUrl: string;
  /** The game this instance serves (one game per instance, D41-3). */
  game: string;
  /** Where the instance keeps its working files (the materialised game, scratch): ephemeral on Clever Cloud. */
  workDir: string;
  port: number;
  host: string;
  /** Proxies whose `X-Forwarded-For` / `X-Forwarded-Proto` are believed: addresses or IPv4 networks. */
  trustProxy: string[];
  store: StoreConfig;
  blobs: BlobsConfig;
  /** OpenID Connect (plan §3.1): without it the server is the local one, on the loopback only. */
  oidc?: {
    issuer: string;
    clientId: string;
    audience: string;
    cliClientId?: string;
    scopes?: string;
    maxTokenSeconds?: number;
    /** A local provider over http (tests); never in production. */
    allowInsecure?: boolean;
  };
  sessions?: { idleHours?: number; absoluteHours?: number };
}

/** The secrets, by name; each from `<NAME>_FILE` or `<NAME>` in the environment. */
const SECRET_NAMES = [
  'STUDIO_DATABASE_URL',
  'STUDIO_S3_KEY_ID',
  'STUDIO_S3_KEY_SECRET',
  'STUDIO_OIDC_CLIENT_SECRET',
  'STUDIO_SESSION_KEY',
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

/** Where a secret may also be read from on Clever Cloud: the add-on's own variable names. */
const ALIASES: Partial<Record<SecretName, string[]>> = {
  STUDIO_DATABASE_URL: ['POSTGRESQL_ADDON_URI'],
  STUDIO_S3_KEY_ID: ['CELLAR_ADDON_KEY_ID'],
  STUDIO_S3_KEY_SECRET: ['CELLAR_ADDON_KEY_SECRET'],
};

export class ConfigError extends Error {}

/**
 * Reads the secrets once, then removes every variable that held one from `env` (by default `process.env`). Returns
 * the values found; a missing one is absent (the server says which it needs when it needs it).
 */
export function takeSecrets(env: NodeJS.ProcessEnv = process.env): Partial<Record<SecretName, string>> {
  const out: Partial<Record<SecretName, string>> = {};
  for (const name of SECRET_NAMES) {
    const fileVar = env[`${name}_FILE`];
    let value: string | undefined;
    let from = '';
    if (fileVar) {
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(fileVar);
      } catch {
        throw new ConfigError(`${name}_FILE (${fileVar}) does not exist`);
      }
      // Windows has no such mode bits (every file reads 0o666): the check is POSIX only.
      if (process.platform !== 'win32' && (st.mode & 0o077) !== 0)
        throw new ConfigError(`${name}_FILE (${fileVar}) is readable by others: chmod 600`);
      value = readFileSync(fileVar, 'utf8').trim();
      from = `${name}_FILE`;
    } else {
      for (const v of [name, ...(ALIASES[name] ?? [])])
        if (env[v] !== undefined) {
          value = env[v]?.trim();
          from = v;
          break;
        }
    }
    for (const v of [name, `${name}_FILE`, ...(ALIASES[name] ?? [])]) delete env[v];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length < 8)
      throw new ConfigError(`${from}: the secret is empty or too short (8 characters at least)`);
    out[name] = value;
  }
  return out;
}

const isUrl = (u: unknown) => {
  try {
    return typeof u === 'string' && ['https:', 'http:'].includes(new URL(u).protocol);
  } catch {
    return false;
  }
};

/** The configuration file, checked: anything unknown or missing is refused with its name. */
export function loadConfig(file: string): StudioServerConfig {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const known = new Set([
    'publicUrl',
    'playUrl',
    'game',
    'workDir',
    'port',
    'host',
    'trustProxy',
    'store',
    'blobs',
    'oidc',
    'sessions',
  ]);
  for (const k of Object.keys(raw)) if (!known.has(k)) throw new ConfigError(`${file}: unknown key "${k}"`);
  if (!isUrl(raw.publicUrl)) throw new ConfigError(`${file}: publicUrl must be an http(s) URL`);
  if (!isUrl(raw.playUrl)) throw new ConfigError(`${file}: playUrl must be an http(s) URL`);
  const origin = (u: unknown) => new URL(String(u)).origin;
  if (origin(raw.publicUrl) === origin(raw.playUrl))
    throw new ConfigError(`${file}: playUrl must be another origin than publicUrl (plan §6.1)`);
  if (typeof raw.game !== 'string' || !/^[a-z0-9][\w-]*$/i.test(raw.game))
    throw new ConfigError(`${file}: game must be a game id`);
  if (typeof raw.workDir !== 'string' || !raw.workDir) throw new ConfigError(`${file}: workDir is required`);
  const store = raw.store as StoreConfig | undefined;
  if (!store || !['sqlite', 'postgres'].includes(store.kind))
    throw new ConfigError(`${file}: store.kind is sqlite or postgres`);
  if (store.kind === 'sqlite' && typeof store.file !== 'string')
    throw new ConfigError(`${file}: store.file is required`);
  const blobs = raw.blobs as BlobsConfig | undefined;
  if (!blobs || !['fs', 's3'].includes(blobs.kind)) throw new ConfigError(`${file}: blobs.kind is fs or s3`);
  if (blobs.kind === 'fs' && typeof blobs.dir !== 'string') throw new ConfigError(`${file}: blobs.dir is required`);
  if (blobs.kind === 's3' && (typeof blobs.host !== 'string' || typeof blobs.bucket !== 'string'))
    throw new ConfigError(`${file}: blobs.host and blobs.bucket are required`);
  const trust = raw.trustProxy ?? [];
  if (!Array.isArray(trust) || !trust.every((t) => typeof t === 'string'))
    throw new ConfigError(`${file}: trustProxy is a list of addresses or networks`);
  const oidc = raw.oidc as StudioServerConfig['oidc'];
  const host = String(raw.host ?? '0.0.0.0');
  if (oidc !== undefined) {
    // Behind a proxy every client shares its address: without trustProxy, the limits would treat a team as one.
    if (!/^(127\.|::1$|localhost$)/.test(host) && trust.length === 0)
      throw new ConfigError(`${file}: trustProxy is required when the server is reachable beyond the loopback`);
    if (!isUrl(oidc.issuer)) throw new ConfigError(`${file}: oidc.issuer must be an http(s) URL`);
    if (typeof oidc.clientId !== 'string' || !oidc.clientId) throw new ConfigError(`${file}: oidc.clientId is required`);
    if (typeof oidc.audience !== 'string' || !oidc.audience) throw new ConfigError(`${file}: oidc.audience is required`);
    if (oidc.audience === oidc.clientId)
      throw new ConfigError(`${file}: oidc.audience must differ from oidc.clientId (an id_token is no access token)`);
  }
  return {
    oidc,
    sessions: raw.sessions as StudioServerConfig['sessions'],
    publicUrl: origin(raw.publicUrl),
    playUrl: origin(raw.playUrl),
    game: raw.game,
    workDir: raw.workDir,
    port: Number(raw.port ?? process.env.PORT ?? 8080),
    host,
    trustProxy: trust as string[],
    store,
    blobs,
  };
}
