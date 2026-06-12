/**
 * Core manifold-3d WASM initialization.
 *
 * The WASM module is loaded lazily on first use and cached as a singleton.
 * Shape construction is handled by the Shape class; this module provides
 * the low-level engine access and backward-compatible helpers.
 */

// ---------------------------------------------------------------------------
// WASM singleton
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _module: any = null;
let _initPromise: Promise<void> | null = null;

/**
 * Initialize the manifold-3d WASM module. Safe to call multiple times —
 * subsequent calls are no-ops. Must be called (and awaited) before any
 * shape construction.
 */
export async function initEngine(): Promise<void> {
  if (_module) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Dynamic import — avoids loading WASM at bundle parse time.
    const mod = await import('manifold-3d');
    // The default export is a factory function that returns the initialized module.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const factory = (mod as any).default ?? mod;
    _module = typeof factory === 'function' ? await factory() : factory;
    if (typeof _module.setup === 'function') {
      _module.setup();
    }
  })();

  return _initPromise;
}

/**
 * Return the cached Manifold module. Throws if `initEngine()` has not been
 * called yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getManifold(): any {
  if (!_module) {
    throw new Error(
      'manifold-3d not initialized — call initEngine() first'
    );
  }
  return _module;
}