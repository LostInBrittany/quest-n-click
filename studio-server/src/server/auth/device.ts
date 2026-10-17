// The CLI's login to a hosted Studio (4.2.1, plan §3.5): the OAuth 2.0 Device Authorization Grant with the provider
// the server names (`/auth/cli`: issuer, public client, audience). The tokens are kept in a file only its owner reads
// (0600, `~/.config/web-scumm/studio-tokens.json` by default), one entry per server; an access token is renewed with
// the refresh token when it has less than a minute left. The server checks every token it receives (policy B).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as client from 'openid-client';

interface Saved {
  issuer: string;
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const defaultTokenFile = () => join(homedir(), '.config', 'web-scumm', 'studio-tokens.json');

function readAll(file: string): Record<string, Saved> {
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, Saved>;
}
function writeAll(file: string, all: Record<string, Saved>) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(all, null, 1)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

async function configFor(issuer: string, clientId: string, allowInsecure: boolean) {
  return client.discovery(
    new URL(issuer),
    clientId,
    undefined,
    client.None(),
    allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined,
  );
}

/** Logs in to `server` with the device flow; `tell` shows the person where to go and the code to type. */
export async function deviceLogin(
  server: string,
  o: { tell: (url: string, code: string) => void; file?: string; allowInsecure?: boolean },
): Promise<void> {
  const meta = (await (await fetch(`${server.replace(/\/$/, '')}/auth/cli`)).json()) as {
    issuer: string;
    client_id: string | null;
  };
  if (!meta.client_id) throw new Error(`${server} names no CLI client: ask its owner to configure oidc.cliClientId`);
  const config = await configFor(meta.issuer, meta.client_id, !!o.allowInsecure);
  const d = await client.initiateDeviceAuthorization(config, { scope: 'openid offline_access' });
  o.tell(d.verification_uri_complete ?? d.verification_uri, d.user_code);
  const t = await client.pollDeviceAuthorizationGrant(config, d);
  const file = o.file ?? defaultTokenFile();
  const all = readAll(file);
  all[server] = {
    issuer: meta.issuer,
    clientId: meta.client_id,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + (t.expires_in ?? 60) * 1000,
  };
  writeAll(file, all);
}

/** A valid access token for `server`, renewed when it has less than a minute left; throws when there is none. */
export async function accessToken(server: string, o: { file?: string; allowInsecure?: boolean } = {}): Promise<string> {
  const file = o.file ?? defaultTokenFile();
  const all = readAll(file);
  const s = all[server];
  if (!s) throw new Error(`not logged in to ${server}: run studio-server login --server ${server}`);
  if (s.expiresAt - Date.now() > 60_000) return s.accessToken;
  if (!s.refreshToken) throw new Error(`the login to ${server} expired: log in again`);
  const config = await configFor(s.issuer, s.clientId, !!o.allowInsecure);
  const t = await client.refreshTokenGrant(config, s.refreshToken);
  all[server] = {
    ...s,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? s.refreshToken,
    expiresAt: Date.now() + (t.expires_in ?? 60) * 1000,
  };
  writeAll(file, all);
  return t.access_token;
}
