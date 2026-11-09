// The connectors' per-address budget (#500): an IPv6 address counts by its /64, an IPv4-mapped one as its IPv4, and the
// sweep of idle addresses runs at most once a minute however full the map is.
import { describe, expect, it } from 'vitest';
import { PerAddress } from '../connectors/src/http';

const entries = (p: PerAddress) => (p as unknown as { m: Map<string, number[]> }).m;

describe('the per-address budget, by network', () => {
  it('gives two addresses of one IPv6 /64 one budget, and another /64 its own', () => {
    const p = new PerAddress(1, () => 0);
    expect(p.take('2001:db8:1:2::1')).toBe(true);
    expect(p.take('2001:db8:1:2:ffff:ffff:ffff:fffe')).toBe(false);
    expect(p.take('2001:db8:1:3::1')).toBe(true);
  });

  it('reads the compressed and the expanded form of one /64 as the same', () => {
    const p = new PerAddress(1, () => 0);
    expect(p.take('2001:db8::1')).toBe(true);
    expect(p.take('2001:0db8:0000:0000:0000:0000:0000:0002')).toBe(false);
    expect(p.take('2001:DB8:0:0::abcd')).toBe(false);
  });

  it('counts an IPv4-mapped address as its IPv4', () => {
    const p = new PerAddress(1, () => 0);
    expect(p.take('1.2.3.4')).toBe(true);
    expect(p.take('::ffff:1.2.3.4')).toBe(false);
    expect(p.take('1.2.3.5')).toBe(true);
  });

  it('sweeps at most once a minute above 10,000 addresses, and the idle ones still go', () => {
    let t = 60_000;
    const p = new PerAddress(1, () => t);
    for (let i = 0; i <= 10_001; i++) p.take(`10.0.${i >> 8}.${i & 255}`);
    // The last take, above 10,000, swept (nothing idle yet); the next ones within the minute do not walk the map.
    t = 90_000;
    const m = entries(p);
    let walks = 0;
    const iterate = m[Symbol.iterator].bind(m);
    m[Symbol.iterator] = () => {
      walks++;
      return iterate();
    };
    for (let i = 0; i < 1_000; i++) p.take(`10.1.${i >> 8}.${i & 255}`);
    expect(walks).toBe(0);
    // A minute later, one sweep, and every address idle for that minute is gone.
    t = 120_001;
    expect(p.take('192.0.2.1')).toBe(true);
    expect(walks).toBe(1);
    expect([...m.keys()].filter((k) => k !== '192.0.2.1').every((k) => k.startsWith('10.1.'))).toBe(true);
    expect(m.size).toBe(1_001);
  });
});
