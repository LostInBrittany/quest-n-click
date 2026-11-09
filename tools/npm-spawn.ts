// npm and npx are `.cmd` files on Windows: Node spawns those only through the shell since CVE-2024-27980 (#490),
// as scripts/pack.mjs does. Callers pass fixed arguments only: cmd.exe would read metacharacters in them.
export const npmSpawn = (name: 'npm' | 'npx', platform: NodeJS.Platform = process.platform) =>
  platform === 'win32' ? { command: `${name}.cmd`, shell: true } : { command: name, shell: false };
