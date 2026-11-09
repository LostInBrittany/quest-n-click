// npm and npx are `.cmd` files on Windows, which Node spawns only through the shell (CVE-2024-27980, #490).
import { describe, expect, it } from 'vitest';
import { npmSpawn } from '../tools/npm-spawn';

describe('npmSpawn (#490)', () => {
  it('runs npm.cmd and npx.cmd through the shell on Windows', () => {
    expect(npmSpawn('npm', 'win32')).toEqual({ command: 'npm.cmd', shell: true });
    expect(npmSpawn('npx', 'win32')).toEqual({ command: 'npx.cmd', shell: true });
  });

  it('runs the bare name without a shell elsewhere', () => {
    expect(npmSpawn('npx', 'linux')).toEqual({ command: 'npx', shell: false });
    expect(npmSpawn('npm', 'darwin')).toEqual({ command: 'npm', shell: false });
  });
});
