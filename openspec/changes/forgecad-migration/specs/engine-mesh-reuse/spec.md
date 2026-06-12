# Delta for engine-mesh-reuse

## MODIFIED Requirements

### Single mesh per export

The CAD engine SHALL triangulate the Manifold shape once per export operation. The resulting mesh data SHALL be cached in memory and reused for STL, GLB, and snapshot consumers.
(Previously: single BRepMesh_IncrementalMesh call per export on OCP shape)

#### Scenario: One mesh for STL + GLB

- GIVEN runCadCode produces a valid manifold-3d shape
- WHEN the export phase begins
- THEN the Manifold triangulation SHALL be computed once
- AND both toSTL and toGLB SHALL use the same cached mesh data

#### Scenario: Current dual-mesh behavior replaced

- GIVEN the manifold-3d implementation
- WHEN STL and GLB are both requested
- THEN separate triangulation calls SHALL NOT occur
- AND both exports SHALL read from a shared in-memory mesh buffer

### Cached mesh data

The unified mesh SHALL produce a cached triangulation consumable by STL and GLB writers.

#### Scenario: Mesh data reused by STL

- GIVEN a cached mesh is available
- WHEN toSTL writes the STL file
- THEN the writer SHALL use the cached vertex and index data
- AND the STL SHALL be binary format

#### Scenario: Mesh data reused by GLB

- GIVEN a cached mesh with vertices and face normals is available
- WHEN toGLB writes the GLB file
- THEN the writer SHALL use the cached data
- AND the GLB SHALL be valid glTF 2.0 binary

#### Scenario: Cache populated from Manifold triangulation

- GIVEN a Manifold.Manifold shape is available
- WHEN the mesh cache is populated
- THEN vertices and face indices SHALL be extracted from the manifold mesh
- AND the data SHALL be stored as typed arrays in a single cache object

### Inspection reuses in-memory shape

The `inspectCadModel` tool SHALL operate on the in-memory Manifold shape returned by runCadCode, not by re-reading any exported file.

#### Scenario: Inspection receives shape directly

- GIVEN runCadCode has produced a Manifold shape
- WHEN inspectCadModel is called
- THEN the inspect function SHALL receive the in-memory shape directly
- AND no file read round-trip SHALL occur

## REMOVED Requirements

### Cached vertex and face arrays (numpy-specific)

(Reason: Python numpy arrays are replaced by JavaScript typed arrays (Float32Array, Uint32Array). The caching concept is preserved but implementation details change.)
(Migration: Mesh cache uses JS typed arrays. OCP-specific iteration over TopExp_Explorer is eliminated.)

### Parallel STL + GLB export (ThreadPoolExecutor)

(Reason: ThreadPoolExecutor is Python-specific. Node.js single-threaded event loop handles concurrent I/O natively. STL and GLB are synchronous operations on cached mesh data — no parallel threading needed.)
(Migration: STL and GLB are exported sequentially from the cached mesh. Both are synchronous operations on pre-computed data. If latency becomes a concern, Worker threads can be introduced later.)

### Tier-driven mesh deflection (OCP deflection values)

(Reason: manifold-3d does not use linear/angular deflection parameters. Mesh quality is controlled by refinement level rather than BRepMesh_IncrementalMesh deflection.)
(Migration: Tier-driven mesh quality uses manifold refinement level (coarse/default/fine) instead of OCP deflection values (0.1/0.8, 0.05/0.5, 0.02/0.3). The intent — finer meshes for complex parts — is preserved.)
