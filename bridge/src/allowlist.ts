// An allowlist of addresses and IPv4 networks (4.1.2, out of server.ts in 4.2.1): the Bridge's trusted proxies, and
// the Studio Server's, whose package ships this file without the rest of the Bridge.
import { isIP } from 'node:net';

// `a.b.c.d/n` with n from 0 to 32 in digits (#483: `10.0.0.0/` read as /0 and trusted every address).
const network = (entry: string) => {
  const m = /^([\d.]+)\/([12]?\d|3[0-2])$/.exec(entry);
  return !!m && isIP(m[1]!) === 4;
};

/** The entries that hold a `/` but are no IPv4 network `a.b.c.d/0` to `/32`: the servers refuse them at start. */
export const malformedEntries = (list: readonly string[]) => list.filter((e) => e.includes('/') && !network(e));

/** Whether an address is in an allowlist of addresses and IPv4 networks (`a.b.c.d/n`). */
export function inAllowlist(address: string, list: readonly string[]): boolean {
  const ip = address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  const v4 = (a: string) => a.split('.').reduce((n, x) => (n << 8) + Number(x), 0) >>> 0;
  return list.some((entry) => {
    const [net, bits] = entry.split('/');
    if (!net) return false;
    if (bits === undefined) return net.replace(/^::ffff:/, '') === ip;
    if (!network(entry) || isIP(ip) !== 4) return false;
    const n = Number(bits);
    const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
    return (v4(ip) & mask) === (v4(net) & mask);
  });
}
