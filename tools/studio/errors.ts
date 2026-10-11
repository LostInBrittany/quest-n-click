// A Studio request refused, with the HTTP status it answers (4.1.19: a module of its own, so the Vite configuration
// reads the Studio's plugin without loading the Studio itself; written without a constructor parameter property, which
// Node's type stripping, what Vite's future native configuration loader relies on, does not accept).
export class StudioError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** A Studio error from any copy of this module (the plugin's, and the one the dev server loads with the Studio). */
export const isStudioError = (e: unknown): e is StudioError =>
  e instanceof Error && typeof (e as { status?: unknown }).status === 'number';
