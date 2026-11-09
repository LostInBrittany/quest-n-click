### Fixed

- **npm and npx start on Windows again from the dev tools (next, #490)**: on Windows with Node 22, `npm run dev:lan`
  and `studio:lan` crashed at once with `spawn EINVAL`, the Studio's Assets "Prepare" answered an error, the
  Assistant's and the MCP server's `run_tests` returned `spawn npx ENOENT`, and `npm run new-game` created the game
  without selecting it. Each now runs `npm.cmd` / `npx.cmd` through the shell there, as the packing scripts already did.
