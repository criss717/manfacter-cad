# glb-session-cache

Per-session GLB byte cache keyed by `(step_hash, deflection, model_id)` to avoid redundant GLB mesh payload computation when the same geometry is requested multiple times within a session.

## Requirements

### Cache keyed by step_hash, deflection, model_id

The GLB session cache SHALL use a composite key of `(step_hash: str, deflection: tuple[float, float], model_id: str)` to identify cache entries.

#### Scenario: Cache hit for identical parameters

**Given** a GLB file was generated and cached for `step_hash="abc123"`, `deflection=(0.05, 0.5)`, `model_id="def456"`
**When** the same combination is requested again in the same session
**Then** the cached GLB bytes SHALL be returned
**And** no `BRepMesh_IncrementalMesh` or GLB payload computation SHALL be performed

#### Scenario: Cache miss for different deflection

**Given** a GLB file was cached for `deflection=(0.05, 0.5)`
**When** the same step_hash and model_id are requested with `deflection=(0.02, 0.3)`
**Then** a cache miss SHALL occur
**And** the GLB SHALL be regenerated with the new deflection
**And** both entries SHALL coexist in the cache

#### Scenario: Cache miss for different model_id

**Given** a GLB file was cached for `model_id="abc123"`
**When** a new generation produces `model_id="def456"` even with the same geometry
**Then** a cache miss SHALL occur (different model_id)
**And** the GLB SHALL be regenerated
**And** the cache SHALL store both entries independently

### Invalidation on code change

When the build123d source code changes (detected via `model_id` change), the corresponding cache entry SHALL be invalidated.

#### Scenario: Cache invalidated by new model_id

**Given** a cached GLB entry exists for `model_id="v1"`
**When** the agent generates new code producing `model_id="v2"` (different step_hash)
**Then** the old entry SHALL remain in cache (keyed by v1)
**And** the new entry SHALL be computed fresh (keyed by v2)
**And** no stale data SHALL be served

#### Scenario: Session termination clears cache

**Given** a session has accumulated N GLB cache entries
**When** the WebSocket connection for that session closes
**Then** all cache entries for that session SHALL be released
**And** memory SHALL be freed

### Per-session isolation

The GLB cache SHALL be scoped to a single WebSocket session. Cross-session cache sharing SHALL NOT be implemented.

#### Scenario: Sessions do not share cache

**Given** Session A has cached GLB bytes for `step_hash="abc123"`
**When** Session B requests GLB for the same `step_hash` and deflection
**Then** Session B SHALL NOT find the entry from Session A's cache
**And** Session B SHALL compute its own GLB payload

#### Scenario: Session reuse within connection

**Given** a single WebSocket connection sends multiple user messages
**When** the same model is regenerated with identical parameters across messages
**Then** the cache SHALL persist across messages within the same session
**And** repeated GLB computation SHALL be avoided

### Cache population from unified mesh

The GLB cache SHALL be populated from the unified mesh cache produced by `engine-mesh-reuse`, not from a separate mesh computation.

#### Scenario: GLB bytes from unified mesh

**Given** the unified mesh cache has been populated with vertex and face arrays
**When** a GLB export is requested
**Then** the GLB payload computation (`glb_mesh_payload.py`) SHALL receive the pre-computed mesh data
**And** the GLB bytes SHALL be computed once and stored in the session cache

#### Scenario: GLB cache avoids re-meshing

**Given** a GLB was already exported and cached for the current deflection
**When** `make_snapshot` is called (which requires GLB)
**Then** the cached GLB bytes SHALL be used directly
**And** no additional mesh computation SHALL be triggered

### Cache size management

The cache SHALL be bounded to prevent memory exhaustion in long-running sessions.

#### Scenario: Cache eviction on size limit

**Given** the session cache reaches a configured maximum number of entries (default: 20)
**When** a new entry needs to be stored
**Then** the least recently used (LRU) entry SHALL be evicted
**And** the new entry SHALL be stored

#### Scenario: Large GLB handling

**Given** a GLB file exceeds a configured size threshold (default: 50 MB)
**When** the GLB would be stored in cache
**Then** the entry SHALL be stored but counted toward a separate memory budget
**And** if total cache memory exceeds the budget, LRU eviction SHALL apply

### Tier-specific deflection in cache key

The tier-classified deflection values SHALL be included in the cache key, ensuring that different quality levels produce distinct cache entries.

#### Scenario: SIMPLE and COMPLEX have separate entries

**Given** the same geometry is exported at SIMPLE tier (coarse deflection 0.1/0.8)
**And** the same geometry is exported at COMPLEX tier (fine deflection 0.02/0.3)
**When** both exports occur in the same session
**Then** two separate cache entries SHALL exist
**And** each SHALL have the correct mesh quality for its tier
