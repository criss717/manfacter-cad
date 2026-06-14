# Tasks: Correct Broken Edge Features & Gear Generation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-450 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (size-exception) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

## Phase 1: Foundation

- [x] 1.1 Wire `trimByPlane` in `src/cad/forgecad-api.ts`: replace throwing stub with `manifold.trimByPlane(normal, originOffset)` where `originOffset = dot(origin, normal)`
- [x] 1.2 Add `transformEdges(edges, rotateFn)` helper in `src/cad/trackedShape.ts` that transforms `start`, `end`, and both `faceNormals` via Rodrigues rotation / mirror vector function
- [x] 1.3 Wire `transformEdges` into `TrackedShape.rotate()` and `TrackedShape.mirror()` overrides so edges stay consistent after transforms

## Phase 2: Fillet/Chamfer Rewrite

- [x] 2.1 Rewrite `fillet()` in `src/cad/stubs.ts`: compute bisector = `n1+n2`, offset = `radius/cos(φ/2)`, build cylinder at offset along bisector, build wedge via two `trimByPlane` calls, intersect cylinder×wedge
- [x] 2.2 Add convex/concave branch: `dot(n1,n2) ≤ 0` → `difference(shape, quarterCylinder)`, `> 0` → `union(shape, quarterCylinder)`
- [x] 2.3 Add oversized-radius guard: skip edge with warning when `radius × 2 > edgeLength`
- [x] 2.4 Rewrite `chamfer()` in `src/cad/stubs.ts`: build `CrossSection.ofPolygons([[[0,0],[d,0],[0,d]]])`, extrude along edge direction, `difference(shape, prism)`
- [x] 2.5 Add oversized-distance guard: skip edge with warning when `distance × 2 > edgeLength`

## Phase 2 Bug Fixes (Post-Audit)

- [x] 2.1-fix Fillet wedge offset sign corrected: convex edges use negated normals with negated offsets; concave edges use original normals with original offsets
- [x] 2.3-fix Chamfer guard corrected: condition changed from `distance * 2 > edgeLen` → `distance > edgeLen`, warn only (no skip)
- [x] 2.4-fix Chamfer triangle prism orientation corrected: replaced `createAlignedCylinderFromShape` (Z-only alignment) with full 4×4 column-major transform mapping profile +X→inward face 1, +Y→inward face 2, +Z→edge direction

## Phase 3: Gear Fix

- [x] 3.1 Fix `gear()` in `src/cad/gears.ts`: use `involutePoints` for right flank, mirror for left flank, correct tip arc angle `-(invAtTip - rotOffset)`, correct root radial lines `±rotOffset`, closed convex polygon
- [x] 3.2 Fix `internalGear()` in `src/cad/gears.ts`: use same corrected involute profile mirrored inward, teeth point toward center
- [x] 3.3 Add `helicalGear(module, teeth, faceWidth, helixAngle)` stub: `console.warn`, returns `gear(module, teeth, faceWidth)`
- [x] 3.4 Fix validation: `teeth ≥ 8`, `pressureAngle ∈ [14.5°, 30°]`, `module > 0`, `faceWidth > 0`
- [x] 3.5 Export `helicalGear` from `src/cad/forgecad-api.ts` and `src/cad/index.ts`

## Phase 5: TypeScript Build Cleanup

- [x] 5.1 Fix dispatch.ts content type errors
- [x] 5.2 Fix tools.ts ParamDefEntry type errors
- [x] 5.3 Fix curves.ts Vec2 import
- [x] 5.4 Fix forgecad-api.ts spline options
- [x] 5.5 Fix surfacing.ts type casts and spline options
- [x] 5.6 Run `npx tsc --noEmit` until clean

## Phase 4: Verification

- [x] 4.1 `npx tsc --noEmit` — strict type checks pass (zero new errors in changed files)
- [ ] 4.2 `pnpm build` — full project build succeeds (pre-existing opencascade.js WASM error, not from changes)
- [ ] 4.3 Visual: `fillet(box(10,10,10), 2, 'top_front')` → quarter-cylinder, reasonable triangle count
- [ ] 4.4 Visual: `chamfer(box(10,10,10), 2, 'top_front')` → clean 45° bevel
- [ ] 4.5 Visual: `gear(2, 20, 10)` → valid 20-tooth involute gear, `numTri() < 5000`
- [ ] 4.6 Visual: `internalGear(2, 40, 10)` → valid ring gear with inward teeth

## Phase 6: Post-Audit Critical Fixes

- [x] 6.1 Fix gear root arc formula in gears.ts
- [x] 6.2 Fix internalGear root arc formula
- [x] 6.3 Wrap sandbox code in block scope in tools.ts
- [x] 6.4 Wrap sandbox code in block scope in generate/route.ts
- [x] 6.5 Throw error in fillet() when edge map is empty
- [x] 6.6 Return params+code from regenerate endpoint
- [x] 6.7 Update InspectorPanel to set regenerated paramDefs
- [x] 6.8 Clear paramDefs on new runCadCode in useCadChat