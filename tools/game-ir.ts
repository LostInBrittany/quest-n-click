// The IR of a loaded game (4.1.12, ADR 0013), out of tools/extensions.ts since 4.1.19: the Vite configuration reads
// the extensions' hash and the engine's version from extensions.ts, never the engine's compiler, which stays out of its
// import graph.
import { compileGame } from '../src/engine/core/define';
import { compileIR, type GameIR } from '../src/engine/core/ir';
import { engineVersion, gameSources, trustedExtensionsHash } from './extensions';
import type { GameModule } from './game';

/** The IR of a loaded game module, with its provenance and its extensions' hash. */
export function gameIR(mod: GameModule, dir: string): GameIR {
  return compileIR(compileGame(mod.game), {
    extensions: {
      trusted: trustedExtensionsHash(dir),
      commands: mod.commands,
      minigames: Object.keys(mod.minigames ?? {}),
    },
    engine: engineVersion(),
    sources: gameSources(dir),
  });
}
