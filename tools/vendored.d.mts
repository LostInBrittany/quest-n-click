/** What a vendored entry's build contains (navmesh: javascript-astar). */
export type Bundled = { name: string; version: string; licence: string; purl: string; source: string };
/** One entry of src/engine/core/nav/navmesh/vendored.json. */
export type Vendored = {
  name: string;
  version: string;
  licence: string;
  purl: string;
  source: string;
  file: string;
  notice: string;
  bundled?: Bundled[];
};
type Component = {
  'bom-ref'?: string;
  type?: string;
  name?: string;
  version?: string;
  components?: Component[];
  [k: string]: unknown;
};
type Sbom = {
  metadata?: { component?: Component; [k: string]: unknown };
  components?: Component[];
  dependencies?: { ref: string; dependsOn?: string[] }[];
  [k: string]: unknown;
};
export const VENDORED: string;
export function readVendored(root: string): Vendored[];
export function bundlesText(v: Vendored): string;
export function noticeHeading(v: Vendored): string;
export function unnamedVendored(root: string, text: string): string[];
export function vendoredNotices(root: string, list?: Vendored[]): string[];
export function withVendored(
  sbom: Sbom,
  dir: string,
): Sbom & { components: Component[]; dependencies: { ref: string; dependsOn: string[] }[] };
