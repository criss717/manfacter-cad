# Delta for glb-session-cache

## MODIFIED Requirements

### Cache keyed by mesh hash and model_id

The GLB session cache SHALL use a composite key of `(meshHash: string, model_id: string)` to identify cache entries. The mesh hash SHALL be derived from the manifold triangulation data, not a STEP file hash.
(Previously: keyed by step_hash, deflection tuple, model_id)

#### Scenario: Cache hit for identical parameters

- GIVEN a GLB was generated and cached for `meshHash="abc123"`, `model_id="def456"`
- WHEN the same combination is requested again in the same session
- THEN the cached GLB bytes SHALL be returned
- AND no mesh triangulation or GLB payload computation SHALL be performed

#### Scenario: Cache miss for different mesh

- GIVEN a GLB was cached for `meshHash="abc123"`
- WHEN the same model_id is requested with a different mesh (different shape)
- THEN a cache miss SHALL occur
- AND the GLB SHALL be regenerated

#### Scenario: Cache miss for different model_id

- GIVEN a GLB was cached for `model_id="abc123"`
- WHEN a new generation produces `model_id="def456"` even with identical geometry
- THEN a cache miss SHALL occur (different model_id)
- AND the GLB SHALL be regenerated

### TypeScript implementation

The GLB cache SHALL be implemented as a `Map<string, GLBCacheEntry>` in TypeScript, scoped per WebSocket session.
(Previously: Python dict-based GLBSessionCache)

#### Scenario: Session termination clears cache

- GIVEN a session has accumulated N GLB cache entries
- WHEN the WebSocket connection for that session closes
- THEN all cache entries for that session SHALL be released
- AND memory SHALL be freed via garbage collection

#### Scenario: Cache eviction on size limit

- GIVEN the session cache reaches the configured maximum (default: 20 entries)
- WHEN a new entry needs to be stored
- THEN the LRU entry SHALL be evicted
- AND the new entry SHALL be stored

### Cache population from shared mesh

The GLB cache SHALL be populated from the mesh buffer shared by the engine-mesh-reuse module, not from a separate mesh computation.

#### Scenario: GLB bytes from shared mesh

- GIVEN the shared mesh cache has been populated with vertex and face data
- WHEN a GLB export is requested
- THEN the GLB payload computation SHALL receive the pre-computed mesh data
- AND the GLB bytes SHALL be computed once and stored in the session cache

#### Scenario: GLB cache avoids re-triangulation

- GIVEN a GLB was already exported and cached
- WHEN renderPNG is called (which requires mesh access)
- THEN the cached mesh data SHALL be used directly
- AND no additional triangulation SHALL be triggered

## REMOVED Requirements

### step_hash-based cache key

(Reason: step_hash was derived from STEP file content. manifold-3d has no STEP intermediary — mesh is generated directly. The cache key uses a hash of the mesh data itself.)
(Migration: `step_hash` is replaced by `meshHash`, computed from the manifold mesh vertex/index arrays.)

### Deflection tuple in cache key

(Reason: manifold-3d does not use linear/angular deflection. Multiple refinement levels produce different meshes and thus different meshHash values automatically.)
(Migration: Different refinement levels produce different meshHash values naturally. No need for a separate deflection key component.)

### Cross-session cache prohibition

(Reason: The existing spec explicitly prohibits cross-session caching. This behavior is preserved — per-session isolation remains.)
(Migration: None — behavior unchanged. TypeScript Map implementation enforces per-session isolation by design.)
