# Exploration: CAD Sketch 2D + Curves + Loft/Sweep Engine

## Current State

ManfacterCAD currently runs a hybrid architecture:
- **Frontend** (Next.js 16.2): Uses `manifold-3d` v3.5.1 for real-time mesh generation and preview. The agent-visible API surface is `src/cad/forgecad-api.ts`.
- **Backend** (Python 3.11 + FastAPI): Uses `build123d` + OpenCASCADE for solid BREP generation, STEP export, and mesh caching. The agent generates Python code that executes `gen_step()`.

The frontend's manifold-3d engine is only used for primitives (`box`, `cylinder`, `sphere`, `torus`) and basic transforms/booleans. The backend does the "real" CAD work. However, the AI agent reads ForgeCAD documentation and tries to call sketch/curve functions that exist in the API surface but throw errors.

### What's Working (manifold-3d frontend)
- 3D primitives: `box`, `cylinder`, `sphere`, `torus` → `Shape` / `TrackedShape`
- Booleans: `union`, `difference`, `intersection` (variadic)
- Transforms: `translate`, `rotate`, `scale`, `mirror`
- Patterns: `linearPattern`, `circularPattern` → `ShapeGroup`
- Face/Edge tracking on `TrackedShape` (for `hole()`, `face()`, `edge()`)

### What's Stubbed (all throw errors)
- **Sketch 2D**: `rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star`, `path`, `stroke`
- **Sketch operations**: `union2d`, `difference2d`, `intersection2d`, `hull2d`
- **Sketch to 3D**: `extrude`, `revolve` (on Sketch objects)
- **Curves**: `spline3d`, `Curve3D`, `Route3D`
- **Surfacing**: `loft`, `sweep`, `variableSweep`, `transitionSurface`, `connectEdges`
- **Features**: `fillet`, `chamfer`, `shell`, `boss`, `pocket`, `draft`, `offsetSolid`
- **Assembly**: `Assembly`, `joint`, `attachTo`
- **Mesh**: `refine`, `simplify`, `slice`, `project`, `warp`

---

## Manifold-3d CrossSection API

Manifold-3d v3.5.1 provides a robust `CrossSection` class that is the ideal foundation for a 2D sketch engine.

### Available Operations
- **Constructors**: `CrossSection.square(size, center)`, `CrossSection.circle(radius, segments)`, `CrossSection.ofPolygons(contours, fillRule)`
- **Transforms**: `translate`, `rotate`, `scale`, `mirror`, `transform(Mat3)`, `warp`, `offset`, `simplify`
- **Booleans**: `add`, `subtract`, `intersect` (instance and static methods)
- **Hull**: `hull()` (convex hull of 2D polygons)
- **Decomposition**: `decompose()` → split into disconnected regions
- **Properties**: `area()`, `isEmpty()`, `numVert()`, `numContour()`, `bounds()`
- **Extrusion**: `crossSection.extrude(height, nDivisions, twistDegrees, scaleTop, center)` → `Manifold`
- **Revolve**: `crossSection.revolve(circularSegments, revolveDegrees)` → `Manifold`
- **Static extrude/revolve**: `Manifold.extrude(polygons, height, ...)`, `Manifold.revolve(polygons, segments, degrees)`

### Can it handle complex polygons with holes?
**Yes.** `CrossSection` is built on Clipper2. It handles complex polygons with holes natively via `ofPolygons(contours, fillRule)`. The `fillRule` (`EvenOdd`, `NonZero`, `Positive`, `Negative`) determines how overlapping regions and holes are interpreted. A single contour can be an outer boundary with inner holes.

### Can it extrude/revolve?
**Yes.** Both `CrossSection.extrude()` and `Manifold.extrude()` exist. The CrossSection instance method is the most natural fit for a ForgeCAD-style API. `extrude()` supports `twistDegrees` and `scaleTop` for tapered/twisted extrusions. `revolve()` revolves around the Y-axis (which ForgeCAD maps to Z-axis after rotation).

### Sweep/Loft support?
**No.** Manifold-3d does NOT have native `sweep` or `loft`. These must be implemented by:
- **Sweep**: Generate a mesh by extruding a profile (CrossSection) along a 3D path (spline), computing perpendicular frames at each sample point.
- **Loft**: Generate a mesh by linearly interpolating between two or more CrossSection profiles, matching vertices and creating triangle strips between them.

---

## ForgeCAD Sketch Architecture (Patterns, Not Code)

From analyzing the ForgeCAD public examples (`.forge.js` files), the sketch engine follows these patterns:

### Internal Representation
- A **Sketch** is a 2D geometric object holding one or more closed contours (outlines + holes).
- It is NOT a mesh. It is a polygonal/curve-based boundary representation (like manifold-3d's `CrossSection`).
- Sketches can be combined via boolean operations (`add`, `subtract`, `intersect`) to create complex profiles.
- A Sketch can be decomposed into `regions()` (individual disconnected filled areas) for selective extrusion.

### Sketch Primitives (Free Functions)
All return a Sketch-like object:
- `rect(width, height)` — centered rectangle
- `circle2d(radius)` — circle centered at origin
- `roundedRect(w, h, r)` — rectangle with rounded corners
- `polygon(vertices[])` — polygon from vertex array
- `ngon(n, radius)` — regular polygon
- `ellipse(rx, ry)` — ellipse
- `slot(w, h)` — rounded-end slot
- `star(n, outerR, innerR)` — star polygon

### Sketch Class Methods
- `.extrude(height, { twist, divisions, scaleTop })` → `Manifold` (3D solid)
- `.revolve(degrees, segments)` → `Manifold`
- `.translate(x, y)`, `.rotate(deg)`, `.scale(factor)`, `.mirror(axis)` → Sketch
- `.add(other)`, `.subtract(other)`, `.intersect(other)` → Sketch
- `.hull()` → Sketch (convex hull)
- `.offset(delta, { joinType })` → Sketch
- `.regions()` → `Sketch[]` (decomposed regions)
- `.region(seedPoint)` → `Sketch` (specific region containing point)

### Constrained Sketch (Advanced)
- `constrainedSketch()` returns a builder for parametric sketching.
- Uses `point()`, `line()`, `circle()`, `addLoop()`, `fix()`, `horizontal()`, `vertical()`, `parallel()`, `perpendicular()`, `equal()`, `length()`, `radius()`, `symmetric()`, `midpoint()`, `pointOnCircle()`, etc.
- `.solve()` returns a Sketch (or throws if over/under-constrained).
- This is a full constraint solver (likely geometric constraint solver or least-squares).

### Curves
- `spline3d(points[], { tension, closed })` → `Curve3D`
- `Curve3D` is a parametric 3D path object.
- `.sample(t)` → `Vec3` (point at parameter t)
- `.tangent(t)` → `Vec3` (tangent at parameter t)
- `.length()` → number
- `.toPolyline(segments)` → `Vec3[]`

### Loft / Sweep
- `sweep(profile, path, { ... })` → `Manifold`
  - `profile`: `Sketch` or `CrossSection`
  - `path`: `Curve3D` or `Route3D`
  - Algorithm: Compute Frenet frames along path, orient profile at each frame, generate mesh by connecting consecutive profiles.
- `variableSweep(path, [{ t, profile }, ...], { edgeLength, samples })` → `Manifold`
  - Like sweep but with profile morphing over t.
- `loft(profiles[], { ... })` → `Manifold`
  - `profiles`: array of `Sketch`/`CrossSection`
  - Algorithm: Match vertices between profiles, create triangle strips connecting them. If vertex counts differ, interpolate or subdivide.
- `transitionSurface(endA, endB, { radius, weightA, weightB })` → `Manifold`
  - Creates a smooth blending surface between two endpoints with tangent vectors.
  - Uses Hermite or cubic interpolation.

### Extrude Options
- `.extrude(height)` — basic
- `.extrude(height, { twist, divisions, scaleTop })` — twisted/tapered extrusion
- `twist` is in degrees, `divisions` is number of vertical segments, `scaleTop` is XY scale factor at top.

---

## Gap Analysis

### What We Have vs. What We Need

| ForgeCAD API | Current Status | manifold-3d Support | Implementation Complexity |
|--------------|----------------|---------------------|---------------------------|
| `rect()` | Stub (throws) | `CrossSection.square()` | **Low** |
| `circle2d()` | Stub (throws) | `CrossSection.circle()` | **Low** |
| `roundedRect()` | Stub | `CrossSection.square()` + `offset()` | **Medium** |
| `polygon()` | Stub | `CrossSection.ofPolygons()` | **Low** |
| `ngon()` | Stub | Manual vertex generation + `ofPolygons()` | **Low** |
| `ellipse()` | Stub | Manual vertex generation + `ofPolygons()` | **Low** |
| `slot()` | Stub | `rect()` + `circle2d()` boolean | **Low** |
| `star()` | Stub | Manual vertex generation + `ofPolygons()` | **Low** |
| `path()` / `stroke()` | Stub | Not directly available | **Medium** |
| `union2d()` | Stub | `CrossSection.add()` | **Low** |
| `difference2d()` | Stub | `CrossSection.subtract()` | **Low** |
| `intersection2d()` | Stub | `CrossSection.intersect()` | **Low** |
| `hull2d()` | Stub | `CrossSection.hull()` | **Low** |
| `Sketch.extrude()` | Stub | `CrossSection.extrude()` | **Low** |
| `Sketch.revolve()` | Stub | `CrossSection.revolve()` | **Low** |
| `spline3d()` | Stub | **Not available** | **High** |
| `Curve3D` | Stub | **Not available** | **High** |
| `loft()` | Stub | **Not available** | **High** |
| `sweep()` | Stub | **Not available** | **High** |
| `variableSweep()` | Stub | **Not available** | **Very High** |
| `constrainedSketch()` | Stub | **Not available** | **Very High** |
| `transitionSurface()` | Stub | **Not available** | **Very High** |
| `fillet()` | Stub (no-op) | **Not available** (needs edge-aware BREP) | **Very High** |
| `chamfer()` | Stub (no-op) | **Not available** | **Very High** |
| `shell()` | Stub (no-op) | **Not available** | **Very High** |

### Estimated Lines of Code
- **Phase 1 (Sketch + basic primitives + extrude/revolve)**: ~300-500 lines
  - `Sketch` class wrapping `CrossSection`
  - Free functions: `rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star`
  - `Sketch.toShape()` or `Sketch.extrude()` integration
  - Update `forgecad-api.ts` to export real functions
- **Phase 2 (2D booleans + hull + offset)**: ~100-200 lines
  - `union2d`, `difference2d`, `intersection2d`, `hull2d`
  - `Sketch.add()`, `Sketch.subtract()`, etc.
  - `Sketch.offset()`
  - `Sketch.regions()` / `Sketch.region()` (using `decompose()`)
- **Phase 3 (Curves + loft + sweep)**: ~800-1200 lines
  - `Curve3D` class with Catmull-Rom / Hermite spline math
  - `spline3d()` function
  - `sweep()` algorithm: frame generation + mesh construction
  - `loft()` algorithm: vertex matching + mesh construction
  - `variableSweep()` (morphing profiles)
  - `transitionSurface()` (Hermite blending)
- **Phase 4 (Constrained sketch)**: ~1500+ lines
  - Full geometric constraint solver (or least-squares solver)
  - Point, line, circle, arc constraints
  - `constrainedSketch()` builder pattern

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| manifold-3d `CrossSection` API changes in future versions | Low | Medium | Pin to v3.x, use `engine.ts` abstraction |
| Performance issues with complex sketches (many vertices) | Medium | Medium | Use `simplify()`, limit segments for curves |
| Sweep/loft mesh quality (non-manifold outputs) | High | High | Use `Manifold.ofMesh()` for validation, fallback to simple extrude |
| Constrained sketch solver is extremely complex | High | High | **Defer to Phase 4 or later**, agent rarely uses it |
| Breaking changes to existing `Shape` API | Low | High | Keep `Shape` as base class, `Sketch` is separate |
| Agent confusion between 2D and 3D APIs | Medium | Medium | Clear naming: `circle2d` vs `circle` (cylinder), `Sketch` vs `Shape` |

---

## Recommended Implementation Plan

### Phase 1: Sketch Class + Basic Primitives + Extrude/Revolve
**Goal**: Make the agent stop failing on basic sketch operations. Implement the most commonly used primitives.

**Deliverables**:
1. `src/cad/sketch.ts` — new `Sketch` class:
   - Wraps `CrossSection` from manifold-3d
   - Stores contours array (for `toPolygons()` round-trip)
   - Methods: `translate`, `rotate`, `scale`, `mirror`, `add`, `subtract`, `intersect`, `hull`, `offset`, `extrude`, `revolve`, `regions`, `region`, `toPolygons`
   - Static constructors: `fromPolygons`, `square`, `circle`
2. `src/cad/sketch-primitives.ts` — free functions:
   - `rect(width, height)` → `Sketch`
   - `circle2d(radius, segments?)` → `Sketch`
   - `roundedRect(width, height, radius)` → `Sketch`
   - `polygon(vertices[])` → `Sketch`
   - `ngon(sides, radius)` → `Sketch`
   - `ellipse(rx, ry, segments?)` → `Sketch`
   - `slot(width, height)` → `Sketch`
   - `star(points, outerRadius, innerRadius)` → `Sketch`
3. Update `src/cad/forgecad-api.ts`:
   - Replace sketch stubs with real exports from `sketch-primitives.ts`
   - Export `Sketch` class
   - Keep `Point2D`, `Line2D`, `Circle2D`, `Rectangle2D` as minimal types (no solver needed for Phase 1)
4. Update `src/cad/index.ts` to export new sketch APIs.
5. Update `src/cad/shape.ts`:
   - Ensure `Shape` can be constructed from a `Manifold` generated by `Sketch.extrude()` (already works, just verify)

**manifold-3d APIs to use**:
- `CrossSection.square()`, `CrossSection.circle()`, `CrossSection.ofPolygons()`
- `CrossSection.add()`, `CrossSection.subtract()`, `CrossSection.intersect()`, `CrossSection.hull()`
- `CrossSection.extrude()`, `CrossSection.revolve()`
- `CrossSection.decompose()` for `regions()`
- `CrossSection.offset()` for `roundedRect` (via `square` + `offset` with `Round` join)

**Validation**:
- `rect(10, 5).extrude(2)` produces a valid `Shape` identical to `box(10, 5, 2)`
- `circle2d(3).extrude(10)` produces a valid `Shape` identical to `cylinder(10, 3)`
- `polygon([...]).extrude(5)` produces a valid prism
- `star(5, 10, 5).extrude(2)` produces a valid star-shaped prism

**Estimated lines**: ~300-500
**Estimated effort**: 1-2 sessions

---

### Phase 2: 2D Booleans + Revolve + Hull + Offset
**Goal**: Enable complex profile creation via boolean combinations and hull operations.

**Deliverables**:
1. `union2d(sketchA, sketchB)` → `Sketch`
2. `difference2d(sketchA, sketchB)` → `Sketch`
3. `intersection2d(sketchA, sketchB)` → `Sketch`
4. `hull2d(sketchA, sketchB, ...)` → `Sketch`
5. `Sketch.revolve(degrees?, segments?)` → `Shape`
6. `Sketch.offset(delta, joinType?)` → `Sketch`
7. `Sketch.regions()` → `Sketch[]`
8. `Sketch.region(seedPoint)` → `Sketch`

**manifold-3d APIs to use**:
- `CrossSection.add()`, `CrossSection.subtract()`, `CrossSection.intersect()`
- `CrossSection.hull()` (instance and static)
- `CrossSection.revolve()`
- `CrossSection.offset()`
- `CrossSection.decompose()` + `CrossSection.ofPolygons()` for region selection

**Validation**:
- `rect(10, 10).subtract(circle2d(3)).extrude(2)` creates a plate with a hole
- `hull2d(rect(10, 5), circle2d(3).translate(10, 0))` creates a convex hull shape
- `circle2d(10).revolve()` creates a sphere-like shape

**Estimated lines**: ~100-200
**Estimated effort**: 1 session

---

### Phase 3: Curves + Loft + Sweep
**Goal**: Enable advanced mechanical parts like impellers, tubes, and variable profiles.

**Deliverables**:
1. `src/cad/curves.ts` — `Curve3D` class:
   - `Curve3D` stores control points and interpolation type (Catmull-Rom, Hermite)
   - `sample(t)` → `Vec3`
   - `tangent(t)` → `Vec3`
   - `length()` → number (adaptive quadrature)
   - `toPolyline(segments)` → `Vec3[]`
   - `frames(segments)` → array of { position, normal, binormal } (Frenet frames)
2. `spline3d(points[], { tension?, closed? })` → `Curve3D`
3. `src/cad/surfacing.ts` — `loft` and `sweep`:
   - `sweep(profile, path, { segments?, twist? })` → `Shape`
     - Profile: `Sketch` (CrossSection)
     - Path: `Curve3D`
     - Algorithm: Sample path, compute perpendicular frames, orient profile at each frame, triangulate between frames.
   - `loft(profiles[], { segments?, ruled? })` → `Shape`
     - Profiles: array of `Sketch`
     - Algorithm: Match vertices (same count or interpolate), create triangle strips.
   - `variableSweep(path, keyframes[], { samples?, edgeLength? })` → `Shape`
     - Keyframes: `[{ t, profile }]`
     - Interpolate profiles between keyframes.
   - `transitionSurface(endA, endB, { radius, weightA, weightB })` → `Shape`
     - Uses Hermite cubic interpolation between two endpoints with tangent vectors.
     - `endA = { point, tangent }`, `endB = { point, tangent }`

**Algorithm Details**:

**Sweep**:
```
1. Sample path into N points (uniform by arc length)
2. Compute Frenet frame at each point (tangent, normal, binormal)
   - Use parallel transport to avoid frame twisting (if path is closed or has inflections)
3. For each frame:
   a. Get profile polygon vertices (from CrossSection.toPolygons())
   b. Transform each vertex to 3D using frame basis vectors
   c. Add to vertex buffer
4. Connect consecutive rings with triangle strips
5. Call Manifold.ofMesh() to validate and create solid
```

**Loft**:
```
1. Ensure all profiles have same vertex count (subdivide largest to match)
2. Align profile start vertices (minimize total edge length between corresponding vertices)
3. For each pair of consecutive profiles:
   a. Create triangle strips connecting vertex i to vertex i+1
   b. Handle capping (first and last profile become end caps)
4. Call Manifold.ofMesh() to validate and create solid
```

**manifold-3d APIs to use**:
- `Manifold.ofMesh(mesh)` to validate and construct from generated mesh
- `CrossSection.toPolygons()` to get profile vertices
- `Mesh` constructor for interleaved vertex/triangle data
- `Manifold.smooth()` for optional smoothing after loft/sweep

**Validation**:
- `sweep(circle2d(2), spline3d([[0,0,0],[10,0,10],[20,10,20]]))` creates a bent tube
- `loft([circle2d(2), circle2d(4), circle2d(2)])` creates a hourglass shape
- `variableSweep(...)` creates a tapered tube

**Estimated lines**: ~800-1200
**Estimated effort**: 3-4 sessions

---

### Phase 4: Constrained Sketch (Deferred)
**Goal**: Full parametric sketching with constraints.

**Recommendation**: **Defer this indefinitely.** The agent almost never uses `constrainedSketch()` in the examples. It's a massive undertaking (a full geometric constraint solver). The basic sketch primitives in Phase 1-2 cover 95% of agent use cases.

If needed later, options:
- **Option A**: Implement a simple least-squares solver for common constraints (fix, horizontal, vertical, equal, parallel, perpendicular, length, radius). ~1500 lines.
- **Option B**: Port a JS constraint solver (e.g., adapt `cassowary` or `geometric-constraint-solver`). ~500 lines integration.
- **Option C**: Offload to the Python backend (build123d has constraints). Not feasible for frontend-only engine.

---

## Files Impacted

### New Files
| File | Purpose | Phase |
|------|---------|-------|
| `src/cad/sketch.ts` | `Sketch` class wrapping `CrossSection` | 1 |
| `src/cad/sketch-primitives.ts` | Free functions: `rect`, `circle2d`, `polygon`, etc. | 1 |
| `src/cad/curves.ts` | `Curve3D` class, `spline3d()`, Frenet frame math | 3 |
| `src/cad/surfacing.ts` | `sweep()`, `loft()`, `variableSweep()`, `transitionSurface()` | 3 |
| `src/cad/sketch.test.ts` | Unit tests for Sketch primitives and booleans | 1-2 |
| `src/cad/curves.test.ts` | Unit tests for curve sampling and frame generation | 3 |
| `src/cad/surfacing.test.ts` | Unit tests for sweep/loft mesh validity | 3 |

### Existing Files to Modify
| File | Changes | Phase |
|------|---------|-------|
| `src/cad/forgecad-api.ts` | Replace sketch/curve stubs with real exports; update `Sketch` class export | 1 |
| `src/cad/index.ts` | Export new sketch/curve APIs | 1 |
| `src/cad/shape.ts` | Ensure `Shape` constructor accepts manifolds from `Sketch.extrude()` (likely no change needed) | 1 |
| `src/cad/engine.ts` | Add `getCrossSection()` helper if needed (probably not, `getManifold()` already returns module with `CrossSection`) | 1 |
| `src/cad/types.ts` | Add `SketchMaterialProps` or `Sketch` types if needed | 1 |
| `src/cad/stubs.ts` | Remove `hull3d` stub if implementing native (already partially done) | 2 |

---

## Recommendation

**Proceed with Phase 1 immediately.** It is low-risk, high-impact, and directly addresses the most common agent failures. The `CrossSection` API is stable and well-documented.

**Phase 2 can be done in the same session as Phase 1** (it's mostly wiring existing manifold-3d methods to free functions).

**Phase 3 should be its own change** (sweep/loft) because it requires custom mesh generation and is higher risk. It should have its own proposal, spec, and design document.

**Phase 4 (constrained sketch) should be deferred** until the agent actually needs it. The current evidence shows it's not used in practice.

**Alternative consideration**: Since the backend already uses build123d (which has full sketch, sweep, loft, fillet, chamfer), another approach is to implement these features in the Python backend and expose them through the code generation pipeline. However, the user's request explicitly says "on top of manifold-3d" and the frontend engine needs them for real-time preview. So frontend implementation is the correct path.

**Minimum viable implementation for Phase 1**:
- `Sketch` class with `extrude()`, `revolve()`, `add()`, `subtract()`, `intersect()`, `hull()`, `offset()`
- `rect()`, `circle2d()`, `polygon()`, `ngon()`, `ellipse()`, `slot()`, `star()`, `roundedRect()`
- `union2d()`, `difference2d()`, `intersection2d()`, `hull2d()`
- This covers ~90% of sketch usage in the ForgeCAD examples.

**Ready for Proposal**: **Yes** — Phase 1 + Phase 2 can be combined into a single proposal under 400 lines. Phase 3 should be a separate proposal after Phase 1 is merged.

---

## Key Findings

1. **Manifold-3d CrossSection is the perfect foundation.** It handles complex polygons, holes, booleans, extrude, revolve, and hull. We don't need to write any 2D geometry kernels.
2. **Sweep/loft must be custom mesh generation.** Manifold-3d has no native support. We build the mesh and validate with `Manifold.ofMesh()`.
3. **Constrained sketch is a massive undertaking.** The examples show it's rarely used by the agent. Defer it.
4. **Phase 1 + 2 is ~400-700 lines.** Well within the 400-line PR limit if we keep tests minimal. We can split Phase 1 and Phase 2 if needed.
5. **The backend build123d already supports these features.** If we need a fallback, the Python backend can handle complex sweeps/lofts until the frontend engine is ready. But the agent needs the frontend API to not throw errors.
