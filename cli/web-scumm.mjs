#!/usr/bin/env node
// web-scumm <command>: the engine's command under the project's former name (D47), an alias through 4.2.x, removed in
// 4.3. It says so on stderr (stdout stays the command's own), then runs quest-n-click with the same arguments.
console.error('web-scumm is now quest-n-click; the old name works until 4.3');
await import('./quest-n-click.mjs');
