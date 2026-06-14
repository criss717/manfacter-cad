# Proposal: Correct Broken Edge Features & Gear Generation

## Intent

The existing `cad-edge-features` implementation produces broken geometry and severe performance degradation. Fillets create full cylinders instead of quarter-cylinders, chamfers create box notches instead of triangular bevels, and gear involutes use incorrect manual polygon math. This proposal corrects the math and wiring to restore correct geometry and eliminate the downstream performance bottleneck.

## Scope

### In Scope
- Fix `fillet` in `stubs.ts`: wire `trimByPlane`, correct offset to `radius / cos(φ/2)`, add convex/concave branching
- Fix `chamfer` in `stubs.ts`: switch to right-triangle CrossSection extruded along edge
- Fix `gear` in `gears.ts`: use `involutePoints`, correct tip/root arc angles, close tooth polygon
- Fix `internalGear` in `gears.ts`: use corrected involute profile mirrored inward
- Wire `trimByPlane` in `forgecad-api.ts` to manifold-3d native method

### Out of Scope
- `helicalGear` remains a stub
- Curved-edge fillets (torus math)
- Shell, pattern implementation
- Gear undercut / profile shift / mesh validation

## Capabilities

### New
- None

### Modified
- `cad-fillet-wedge`: Change from full-cylinder union to correct quarter-cylinder wedge intersection with proper offset and convex/concave detection
- `cad-chamfer-wedge`: Change from rotated box to right-triangle CrossSection extruded along edge
- `cad-gear-generation`: Change from manual broken polygon to correct involute profile using existing `involutePoints`
- `cad-edge-integration`: Change from throwing stub to wired `trimByPlane` in `forgecad-api.ts`

## Approach

1. **Wire `trimByPlane`**: Export `Manifold.trimByPlane(normal, originOffset)` as scalar `originOffset = dot(faceCenter, normal)`.
2. **Fix fillet**: Compute bisector offset `radius / cos(φ/2)`. Convex edges (`dot(n1,n2) < 0`) use `union`; concave edges (`dot(n1,n2) > 0`) use `difference`. Intersect cylinder with wedge from `trimByPlane`.
3. **Fix chamfer**: Use `CrossSection.ofPolygons([[[0,0],[d,0],[0,d]]])` then `extrude(length)` along edge.
4. **Fix gear**: Use `involutePoints`; set tip arc target to `-(invAtTip - rotOffset)`; set root radial angles to `±rotOffset`; ensure closed strictly convex tooth polygon.
5. **Fix `internalGear`**: Mirror corrected tooth profile inward.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cad/stubs.ts` | Modified | `fillet`/`chamfer` bodies rewritten with correct wedge/triangle math |
| `src/cad/gears.ts` | Modified | `gear()`/`internalGear()` use correct involute profile; dead code removed |
| `src/cad/forgecad-api.ts` | Modified | `trimByPlane` wired to manifold-3d native method |
| `src/cad/export.ts` | Modified | Performance improves indirectly via lower triangle count |
| `src/viewport/CadExplorer.tsx` | Modified | Performance improves indirectly via lower triangle count |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `trimByPlane` scalar offset misunderstood | Med | Inline comment: `originOffset = dot(faceCenter, normal)` |
| `dot(n1,n2) === 0` convex/concave ambiguity | Low | Default to convex (union) when `dot ≤ 0` |
| Gear involute edge cases | Med | Validate `numTri()` and `volume()` are reasonable |
| Boolean failures on trimmed cylinders | Low | Guard: skip if `radius * 2 > edgeLength` |

## Rollback Plan

Revert `stubs.ts`, `gears.ts`, and `forgecad-api.ts` to previous versions. Remove any new exports. No DB migration needed.

## Dependencies

- `manifold-3d` `trimByPlane` and booleans (already available)

## Success Criteria

- [ ] `fillet(box(10,10,10), 2)` produces quarter-cylinder tangent to faces; `numTri()` < 5× baseline
- [ ] `chamfer(box(10,10,10), 2)` produces clean 45° triangular bevel
- [ ] `gear(2, 20, 10)` produces valid 20-tooth module-2 gear; `numTri()` and `volume()` reasonable
- [ ] `internalGear(2, 40, 10)` produces valid ring gear
- [ ] `tsc --noEmit` and `pnpm build` pass
- [ ] Viewport remains responsive after applying edge features to a 20-edge shape
