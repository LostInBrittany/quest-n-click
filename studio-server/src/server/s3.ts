// A minimal S3 client for the hosted blobs (4.2.1, plan §4): Cellar on Clever Cloud, MinIO in CI. Path-style
// requests signed with AWS Signature Version 4 (node:crypto only, no SDK): PUT, GET and HEAD of one object, and
// presigned GET/PUT URLs for the processing worker (plan §3.8). Spike S measured Cellar: a presigned URL is reusable
// until it expires and gives nothing else; a PUT overwrites. The blob store never relies on If-None-Match: a key is
// the sha256 of its content, so writing it twice writes the same bytes.
import { createHash, createHmac } from 'node:crypto';
import { sha256 } from '../ops/durable';
import type { BlobStore } from '../ops/blobs';

export interface S3Options {
  /** `https://cellar-c2.services.clever-cloud.com` or `http://127.0.0.1:9000` (MinIO). */
  endpoint: string;
  bucket: string;
  keyId: string;
  secret: string;
  region?: string;
  /** A key prefix (`blobs/`). */
  prefix?: string;
}

const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest();
const hex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p: string) => p.split('/').map(enc).join('/');

function stamp(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz: iso, day: iso.slice(0, 8) };
}

export class S3 {
  private url: URL;
  private region: string;
  constructor(private o: S3Options) {
    this.url = new URL(o.endpoint);
    this.region = o.region ?? 'us-east-1';
  }

  private key(k: string) {
    return `${this.o.prefix ?? ''}${k}`;
  }

  private signingKey(day: string) {
    const k1 = hmac(`AWS4${this.o.secret}`, day);
    const k2 = hmac(k1, this.region);
    const k3 = hmac(k2, 's3');
    return hmac(k3, 'aws4_request');
  }

  /** Signs a request (header form) and sends it. */
  private async request(
    method: string,
    key: string,
    body?: Buffer,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const path = `/${this.o.bucket}/${encPath(this.key(key))}`;
    const { amz, day } = stamp();
    const payload = body ? hex(body) : hex('');
    const headers: Record<string, string> = {
      host: this.url.host,
      'x-amz-content-sha256': payload,
      'x-amz-date': amz,
      ...extra,
    };
    const names = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonical = [
      method,
      path,
      '',
      ...names.map((n) => `${n}:${String(headers[n]).trim()}`),
      '',
      names.join(';'),
      payload,
    ].join('\n');
    const scope = `${day}/${this.region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amz, scope, hex(canonical)].join('\n');
    const sig = hmac(this.signingKey(day), toSign).toString('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.o.keyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
    const { host: _h, ...send } = headers;
    // Bounded: a request that hangs must not hold the journal's lease (renewed while an operation runs) forever.
    return fetch(new URL(path, this.url), {
      method,
      headers: send,
      body: body ? new Uint8Array(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  }

  async put(key: string, body: Buffer): Promise<void> {
    const r = await this.request('PUT', key, body);
    if (!r.ok) throw new Error(`S3 PUT ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }

  async get(key: string): Promise<Buffer | undefined> {
    const r = await this.request('GET', key);
    if (r.status === 404) return undefined;
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`S3 GET ${key}: ${r.status}`);
    }
    return Buffer.from(await r.arrayBuffer());
  }

  async has(key: string): Promise<boolean> {
    const r = await this.request('HEAD', key);
    if (r.status === 404) return false;
    if (!r.ok) throw new Error(`S3 HEAD ${key}: ${r.status}`);
    return true;
  }

  /** A presigned URL (query form) for one method on one key, valid `seconds` (plan §3.8: ≤ 300 for a job). */
  presign(method: 'GET' | 'PUT', key: string, seconds: number): string {
    const path = `/${this.o.bucket}/${encPath(this.key(key))}`;
    const { amz, day } = stamp();
    const scope = `${day}/${this.region}/s3/aws4_request`;
    const q: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.o.keyId}/${scope}`,
      'X-Amz-Date': amz,
      'X-Amz-Expires': String(seconds),
      'X-Amz-SignedHeaders': 'host',
    };
    const query = Object.keys(q)
      .sort()
      .map((k) => `${enc(k)}=${enc(q[k]!)}`)
      .join('&');
    const canonical = [method, path, query, `host:${this.url.host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const toSign = ['AWS4-HMAC-SHA256', amz, scope, hex(canonical)].join('\n');
    const sig = hmac(this.signingKey(day), toSign).toString('hex');
    return `${new URL(path, this.url).toString()}?${query}&X-Amz-Signature=${sig}`;
  }
}

/** Blobs in S3 under `sha256/<hex>`, read back and checked against their hash. */
export function s3BlobStore(s3: S3): BlobStore {
  const key = (h: string) => {
    if (!/^[0-9a-f]{64}$/.test(h)) throw new Error(`not a blob hash: "${h}"`);
    return `sha256/${h}`;
  };
  return {
    async put(bytes) {
      const h = sha256(bytes);
      if (!(await s3.has(key(h)))) await s3.put(key(h), bytes);
      return h;
    },
    async get(h) {
      const b = await s3.get(key(h));
      if (!b) throw new Error(`blob ${h} is missing`);
      if (sha256(b) !== h) throw new Error(`blob ${h} is damaged`);
      return b;
    },
    has: (h) => s3.has(key(h)),
  };
}
