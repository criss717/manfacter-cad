I don't have access to the Engram persistence tools in this environment, but I saved the full exploration to the filesystem. I need the orchestrator to persist `sdd/cad-mesh-quality/explore` to Engram with project `manfacter-cad`.

## Exploration: Smooth Mesh Generation for Loft/Sweep

### Current State

`src/cad/surfacing.ts` implements `loft()` and `sweep()` by generating custom triangle-strip meshes and feeding them to `Manifold.ofMesh()`. When `ofMesh()` fails, it falls back to ugly union-of-extrusions approximations.

The current algorithm:
1. Extracts 2D vertices from `Sketch.crossSection` via `toPolygons()` or area-based circle approximation
2. Resamples all profiles to a uniform vertex count (`targetVerts`, default at least 16)
3. Builds a triangle strip between adjacent rings
4. Caps both ends using **fan triangulation from a bounding-box center**
5. Passes the raw buffers to `Manifold.ofMesh()` as a **plain object** (not a `Mesh` instance)

### Root Cause of Mesh Failure

There are **three primary failure modes**:

1. **Invalid cap triangulation** (most critical):  
   Fan triangulation from a bounding-box center works only for convex profiles. For non-convex profiles (e.g., L-shapes, C-shapes), the center can lie **outside the polygon**, and fan triangles **cross polygon edges** and **overlap each other**. This produces self-intersecting geometry, which violates the 2-manifold requirement. `Manifold.ofMesh()` throws `NotManifold` because the mesh is not watertight and contains overlapping faces.

2. **Hole handling bug in `getSketchVertices`**:  
   `toPolygons()` returns an array of polygons (outer contours and holes). The current code flattens **all** points from **all** polygons into a single vertex ring:  
   ```typescript
   for (const poly of polys) {
     for (const point of poly) {
       vertices.push([point[0], point[1], 0]);
     }
   }
   ```
   This treats hole vertices as part of the outer perimeter, producing a **self-intersecting ring** for any sketch with holes.

3. **Mesh API misuse**:  
   `Manifold.ofMesh()` expects a `Mesh` **instance** (`new m.Mesh(options)`), not a plain object. The current code passes:  
   ```typescript
   { numProp: 3, vertProperties, triVerts }
   ```
   While the JS/WASM binding may duck-type in some cases, this is unreliable and may cause silent failures or incorrect merge-vector handling.

### Affected Areas
- `src/cad/surfacing.ts` — entire file; `loft()`, `sweep()`, `getSketchVertices()`, cap triangulation, and mesh construction
- `src/cad/engine.ts` — may need `Mesh` class export exposure if not already available

### Approaches

1. **Fix current mesh generation**
   - Fix `getSketchVertices()` to properly separate outer contours and holes
   - Use `manifold.triangulate()` to generate proper cap triangulation instead of fan approximation
   - Create `new m.Mesh({ ... })` instances before passing to `Manifold.ofMesh()`
   - Add `mergeFromVert` / `mergeToVert` vectors to weld duplicate vertices (e.g., at ring seams)
   - Pros: Keeps the current architecture, minimal file changes, fast, preserves custom vertex resampling
   - Cons: Requires correct handling of holes; loft topology for multi-contour profiles is still complex
   - Effort: **Medium**

2. **Rewrite using manifold native operations**
   - Loft: No native `loft()` in manifold-3d v3.5.1. Could approximate with `CrossSection.extrude()` + `Manifold.add()` for each segment, but this creates faceted steps and does not interpolate smoothly.
   - Sweep: No native `sweep()` in manifold-3d.
   - Pros: Uses guaranteed-manifold operations
   - Cons: Produces the same ugly segmented results as the current fallback; not a true loft/sweep
   - Effort: **Low** (but poor quality, not recommended)

3. **Hybrid: triangulate caps + triangle-strip sides**
   - Use `triangulate()` for top and bottom caps
   - Keep triangle-strip generation for the side walls
   - Handle holes by treating outer contours and holes as separate rings connected by bridging triangles
   - Pros: Best quality, mathematically correct for simple cases
   - Cons: Most complex; bridging holes between lofted cross-sections is non-trivial
   - Effort: **High**

### Recommendation

**Go with Approach 1 (Fix current mesh generation)** as the immediate fix.

Specific fixes needed:
1. **Cap triangulation**: For each cap, use `m.triangulate(polygon, epsilon)` to get proper triangle indices. Map the 2D triangulation back to the 3D vertex indices.
2. **Hole handling**: `getSketchVertices()` must return separate outer and hole contours. For the initial fix, restrict `loft()`/`sweep()` to sketches with a single outer contour (no holes) or handle holes by triangulating each cap with the full polygon set.
3. **Mesh construction**: Use `new m.Mesh({ numProp: 3, vertProperties, triVerts })` instead of a plain object.
4. **Vertex welding**: Ensure the first and last vertex of each ring are shared (they already are in the index math via `% vertsPerRing`), but the cap center vertices may need merge vectors.

### Risks
- **Non-convex profiles**: Even with `triangulate()`, if the profile self-intersects after resampling, `ofMesh()` will still fail. Resampling by arc length should preserve simple polygons but needs validation.
- **Holes in profiles**: True lofting between profiles with holes requires matching hole topology between sections, which is hard. We should document this limitation or handle it in a follow-up.
- **Sweep path degeneracy**: If the sweep path has zero-curvature segments or kinks, the Frenet frames can flip or twist, causing the swept mesh to self-intersect. The `frames()` method already uses parallel transport, but tight bends can still cause profile self-intersection.
- **No test coverage**: `src/cad/` has zero tests. Any fix must be verified manually or via integration tests.

### Ready for Proposal

**Yes.** The next step is to write a design document for the fix, including:
1. A `Mesh` class wrapper for `surfacing.ts`
2. Cap triangulation using `m.triangulate()`
3. A `getSketchPolygons()` helper that preserves polygon structure (outer + holes)
4. Manual verification steps for loft and sweep with convex, non-convex, and circular profiles

### Files to Change
- `src/cad/surfacing.ts` — primary fix
- `src/cad/engine.ts` — verify `Mesh` is accessible from `getManifold()` (it should be via `m.Mesh`)

### Estimated Effort
- **Medium** (~1–2 days for implementation + verification)
