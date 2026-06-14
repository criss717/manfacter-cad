# Exploration: cad-edge-features — Broken Geometry & Performance

## Current State

The `cad-edge-features` change is partially implemented but produces broken geometry and severe performance degradation.

### Fillet (`stubs.ts`)
- **Current implementation** creates a **full cylinder** at each edge, offsets it along the face-normal bisector by `radius` (incorrect — should be `radius / cos(φ/2)`), and **unions** it with the shape.
- This produces a full cylinder sticking out of the edge, not a quarter-cylinder tangent to both faces. The union merges the cylinder with the solid, causing the manifold-3d boolean engine to generate a **massive triangle count increase** at the intersection.
- The design intended to use `trimByPlane` (Manifold instance method) to create a wedge, then `intersection(cylinder, wedge)` to get a quarter-cylinder. However:
  - `forgecad-api.ts` exports a `trimByPlane` **stub that throws an error**.
  - `manifold-3d` DOES have `Manifold.trimByPlane(normal, originOffset)` — the stub just needs to be wired.
  - The design doc has a bug: it passes `face1.origin` (a `Vec3`) as `originOffset` to `trimByPlane`, which expects a **scalar** (signed distance from origin).
  - The design uses `difference(shape, quarterCylinder)` for convex edges, but convex edges need **union** (add material). Concave edges need **difference**.

### Chamfer (`stubs.ts`)
- **Current implementation** creates a `box(distance, distance, length)`, rotates it to the edge direction, and subtracts it.
- This creates a **box-shaped notch**, not a 45° bevel. The design specifies a **right-triangle CrossSection** extruded along the edge.
- `CrossSection.ofPolygons([[(0,0), (d,0), (0,d)]])` then `extrude(length)` is the correct approach.

### Gear (`gears.ts`)
- **`involutePoints` and `buildToothProfile` are dead code** — defined but never used by `gear()`.
- The `gear()` function manually builds the tooth polygon with **multiple mathematical bugs**:
  1. **Tip arc is wrong**: uses `halfTooth` as the target angle instead of the actual left-tip angle `-(invAtTip - rotOffset)`. The arc does not connect to the left flank, creating a gap or overlap.
  2. **Root radial lines are wrong**: below the base circle, it uses `halfTooth * 0.6` as a fixed angle. The correct angle should be `rotOffset` (right) and `-rotOffset` (left) to connect smoothly to the involute at the base circle.
  3. **Root arc discontinuity**: the root arc is drawn at `rootRadius`, but the endpoint of the left flank is at `rStart = max(rootRadius, baseRadius + 0.01)`. If `rStart ≠ rootRadius`, there is a radius jump.
- `internalGear` uses a **trapezoid approximation** (`toothWidth * 0.3`, etc.) instead of an involute profile.

### Performance Bottleneck
- The fillet union of a **full cylinder** with wrong offset causes manifold-3d to produce **bad/degenerate boolean geometry**, which dramatically increases the triangle count.
- `toGLB()` and `toSTL()` in `export.ts` then **loop over every triangle** in a plain `for` loop. With a huge triangle count, this becomes the bottleneck.
- The Three.js viewport (`CadExplorer.tsx`) also slows down rendering a high-polygon mesh.
- The `AutoZoom` component does `new THREE.Box3().setFromObject(scene)` which traverses the whole scene. With huge geometry, this is slow.

### Why Wedge Intersection Returns Empty
- If the user tried to call the `forgecad-api.ts` `trimByPlane` stub, it **throws** immediately.
- If they called the manifold instance method directly, passing a `Vec3` as `originOffset` (per the design doc) causes a **type/runtime error** or incorrect plane placement.
- Even with correct scalar `originOffset`, if the cylinder center is positioned **outside** the half-space defined by `trimByPlane`, the `intersection(cylinder, wedge)` will be empty.

---

## Affected Areas

| File | Why Affected |
|------|-------------|
| `src/cad/stubs.ts` | `fillet` and `chamfer` bodies are fundamentally wrong vs. design. |
| `src/cad/trackedShape.ts` | `EdgeRef.faceNormals` is correct; transform helpers need to rotate edge normals too (not yet done). |
| `src/cad/gears.ts` | `gear()` involute math is broken; `internalGear` uses trapezoid stub. |
| `src/cad/forgecad-api.ts` | `trimByPlane` stub is unimplemented; `gear`/`internalGear` exports are correct but underlying geometry is wrong. |
| `src/cad/primitives.ts` | `cylinder` is used by fillet; base-at-Z=0 convention matters for positioning. |
| `src/cad/export.ts` | `toGLB` / `toSTL` loops over all triangles — performance scales with triangle count. |
| `src/viewport/CadExplorer.tsx` | `AutoZoom` + Three.js rendering slows down on high-polygon meshes. |

---

## Approaches

### 1. Fix Existing Wedge Approach (Recommended)
- **Wire `trimByPlane`** in `forgecad-api.ts` to call `manifold.trimByPlane(normal, originOffset)`.
- **Compute `originOffset`** correctly as scalar: `originOffset = dot(faceCenter, normal)`.
- **Fix fillet offset**: `offset = radius / cos(φ/2)` where `φ = acos(dot(n1, n2))`.
- **Fix convex/concave logic**: `dot(n1, n2) < 0` → convex → `union` with outside quarter-cylinder. `dot(n1, n2) > 0` → concave → `difference` with inside quarter-cylinder.
- **Fix chamfer**: Use `CrossSection.ofPolygons([[[0,0], [d,0], [0,d]]])` then `extrude(length)`.
- **Fix gear**: Use the dead `involutePoints` function properly; fix tip/root arc math; fix root radial line angles.

| Aspect | Detail |
|--------|--------|
| Pros | Matches the design spec; produces correct quarter-cylinder fillets and true 45° chamfers; gear involutes are mathematically correct. |
| Cons | Requires touching 4–5 files; gear fix needs careful math verification; `trimByPlane` wiring is a new API surface. |
| Effort | **Medium** |

### 2. Fallback to Simpler Robust Approach
- **Fillet**: Skip wedge intersection entirely. For each edge, compute the correct cylinder center and **union** the full cylinder. Then rely on manifold-3d boolean union to merge correctly. This is what the current code *tries* to do, but with the **offset fixed** (use `radius / cos(φ/2)`) and **only union** for convex edges. For concave edges, use `difference`.
- **Chamfer**: Use a `box` scaled by `0.5` in one axis and rotated 45° (simple hack) instead of a triangle CrossSection.
- **Gear**: Keep the current manual polygon but patch the tip and root arc angles. Use `-(invAngle - rotOffset)` for the left tip.

| Aspect | Detail |
|--------|--------|
| Pros | Fewer files changed; minimal code churn; less risk of introducing new bugs. |
| Cons | Full-cylinder fillet union is still geometrically heavy; the box chamfer is not a true 45° triangle; gear profile remains approximate. |
| Effort | **Low** |

### 3. Hybrid: Fix Fillet/Chamfer Properly, Gear as Stub
- Fix fillet and chamfer using the wedge approach (Approach 1).
- For gear, keep the current approximate profile but fix the most obvious bug (tip arc angle). Add a `helicalGear` stub as already planned.
- This gets the high-priority edge features working correctly while deferring perfect gear involutes.

| Aspect | Detail |
|--------|--------|
| Pros | Maximizes correctness where it matters (fillet/chamfer are user-facing features); reduces scope. |
| Cons | Gear still produces incorrect involutes; user may still report gear issues. |
| Effort | **Medium** |

---

## Recommendation

**Approach 1 (Fix Existing Wedge Approach)** with the following surgical priorities:

1. **Highest priority**: Fix `fillet` in `stubs.ts` — implement `trimByPlane` stub, correct the offset formula, and add convex/concave branching. This is the root cause of the broken geometry AND the performance explosion.
2. **High priority**: Fix `chamfer` in `stubs.ts` — switch to triangle CrossSection + extrude.
3. **Medium priority**: Fix `gear` in `gears.ts` — use `involutePoints`, fix tip/root arcs, and correct root radial angles.
4. **Low priority**: Fix `internalGear` — use the same corrected tooth profile, mirrored inward.

### Why this is the right choice
- The design spec is already written; the infrastructure (`faceNormals`, `trimByPlane` in manifold-3d) exists. We just need to wire it correctly and fix the math.
- The fillet bug is the **root cause of the performance issue** (bad boolean → huge triangle count → slow export/render). Fixing it fixes performance.
- The gear fix is isolated to `gears.ts` and doesn't affect the rest of the pipeline.

---

## Risks

| Risk | Mitigation |
|------|------------|
| `trimByPlane` scalar `originOffset` is misunderstood again | Add explicit inline comment: `originOffset = dot(faceCenter, normal)` (scalar). |
| `dot(n1, n2) === 0` (orthogonal) makes convex/concave detection ambiguous | For standard box edges, `dot(n1, n2) = 0` is always convex. Use the edge direction + normal ordering to determine sign if needed. Simpler: default to convex (union) when `dot ≤ 0`. |
| Gear involute fix is subtle and may still have edge cases | Validate with `gear(2, 20, 10)` and check `numTri()` and `volume()` are reasonable. Visual inspection of exported STL. |
| Boolean operations on trimmed cylinders may still be slow for many edges | Add `radius` guard: skip if `radius * 2 > edgeLength` (already partially done). Batch edge processing. |
| CrossSection `ofPolygons` may fail on self-intersecting tooth profile | Ensure tooth polygon is strictly convex and closed. Add `toPolygons()` debug if needed. |

---

## Ready for Proposal

**Yes.** The investigation reveals:
- The `fillet` bug is a compound of wrong offset + full cylinder + missing `trimByPlane` wiring.
- The `chamfer` bug is using a box instead of a triangle prism.
- The `gear` bug is incorrect tip/root arc math in the manual polygon builder.
- Performance is downstream of the fillet bug (bad geometry → high triangle count → slow export/render).

All these are fixable within the existing architecture. The next step is a **propose** phase that documents the exact code changes and acceptance criteria.

### Key Learnings
- `manifold-3d` has `Manifold.trimByPlane(normal, originOffset)` — the scalar `originOffset` is critical. The design doc passing `face1.origin` (Vec3) is a bug.
- `EdgeRef.faceNormals` are outward-pointing. Convex edges need `union` with an outside quarter-cylinder; concave edges need `difference` with an inside quarter-cylinder.
- The `involutePoints` function in `gears.ts` is already correct but unused. The `gear()` function's manual polygon builder has the tip arc target angle wrong.
- `toGLB()` / `toSTL()` in `export.ts` are simple loops — their performance is directly proportional to `numTri()`. Bad boolean geometry is the root cause of the slowdown.
