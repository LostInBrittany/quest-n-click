// `--from=previous` (#534): one resolver for upgrade-check and the candidate's external-consumer, without the network.
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs script without declarations
import { previousRelease } from '../scripts/upgrade-source.mjs';

const tags = ['v4.7.1', 'v4.7.2', 'v4.7.0', 'v4.8.0-rc.1', 'v4.1.18-rc.1', '4.6.9', 'v3.8.0', 'v4.10.0'];

describe('--from=previous', () => {
  it('picks the newest stable strictly older than this version, pre-releases left out', () => {
    expect(previousRelease(tags, '4.8.0')).toBe('4.7.2');
    expect(previousRelease(tags, '4.7.2')).toBe('4.7.1');
    expect(previousRelease(tags, '4.11.0')).toBe('4.10.0');
  });

  it('never the candidate itself, even once it is published', () => {
    expect(previousRelease([...tags, 'v4.8.0'], '4.8.0')).toBe('4.7.2');
  });

  it('refuses when no release with a tarball (3.9 on) is older', () => {
    expect(() => previousRelease(tags, '3.9.0')).toThrow('no published release with a package tarball before 3.9.0');
    expect(() => previousRelease([], '4.8.0')).toThrow(/before 4\.8\.0/);
  });
});
