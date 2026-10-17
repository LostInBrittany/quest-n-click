// Where the Studio's API lives. The dev server serves it under /__studio/api (tools/studio/plugin.ts); the Studio
// Server of 4.2.1 serves the same routes under its own prefix. One constant, so no module spells the path itself.
const API_BASE = '/__studio/api';

/** The URL of an API route: `apiUrl('game')` → `/__studio/api/game`. */
export const apiUrl = (path: string) => `${API_BASE}/${path}`;
