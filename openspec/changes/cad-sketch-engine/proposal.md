# Proposal: CAD Sketch 2D + Curves + Loft/Sweep Engine

## Intent

Enable the AI agent to create real 2D sketches, 3D curves, and advanced surfaces (loft/sweep) using the frontend manifold-3d engine. Currently, 40+ ForgeCAD API functions in `forgecad-api.ts` are stubs that throw errors. This change replaces those stubs with real implementations backed by manifold-3d's `CrossSection` API and custom mesh generation.

## Scope

### In Scope
- `Sketch` class wrapping `CrossSection` — immutable, chainable
- Sketch primitives: `rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star`
- Sketch operations: `union2d`, `difference2d`, `intersection2d`, `hull2d`, `offset`, `filletCorners`
- Sketch → 3D: `extrude`, `revolve`
- `Curve3D` class + `spline3d` (Catmull-Rom)
- Surfacing: `loft` (multi-profile), `sweep` (profile along path)
- Replace all 40+ stubs in `forgecad-api.ts` with real implementations
- Update `src/cad/index.ts` and `src/cad/engine.ts` exports

### Out of Scope
- Constrained sketch solver (`constrainedSketch`, `Point2D` constraints)
- Sheet metal, assembly, joints
- SDF modeling
- STEP export for sketches
- `variableSweep`, `transitionSurface`, `connectEdges` (future surfacing)

## Capabilities

### New Capabilities
- `sketch-2d`: `Sketch` class, primitives, 2D booleans, extrude/revolve
- `curve-3d`: `Curve3D` parametric path, `spline3d`, Frenet-frame sampling
- `surfacing-loft-sweep`: `loft` and `sweep` via custom mesh generation validated with `Manifold.ofMesh()`

### Modified Capabilities
- `cad-stubs-forgecad`: Replace sketch/curve/surfacing stubs with real exports
- `cad-engine-ts`: Expose `CrossSection` API via `getManifold()` accessor

## Approach

**Sketch**: Thin wrapper around `CrossSection`. All primitives use `CrossSection.square()`, `.circle()`, `.ofPolygons()`. Booleans delegate to `add/subtract/intersect`. `extrude()` and `revolve()` call `CrossSection` instance methods.

**Curves**: `Curve3D` stores control points and interpolates with Catmull-Rom. `sample(t)` returns `Vec3`; `frames(n)` returns Frenet-Serret frames (with parallel-transport fallback for degenerate tangents).

**Loft/Sweep**: Custom mesh generation. Sample path/height layers. Place profile vertices at each frame. Connect adjacent rings with triangle strips. Cap ends. Validate via `Manifold.ofMesh()`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cad/sketch.ts` | New | `Sketch` class + primitives + 2D booleans |
| `src/cad/curves.ts` | New | `Curve3D` + `spline3d` |
| `src/cad/surfacing.ts` | New | `loft` + `sweep` mesh generation |
| `src/cad/forgecad-api.ts` | Modified | Replace stubs with real implementations |
| `src/cad/index.ts` | Modified | Add new exports |
| `src/cad/engine.ts` | Modified | Ensure `CrossSection` is accessible |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Loft/sweep mesh is non-manifold | Medium | Validate with `Manifold.ofMesh()`; fall back to union approximation |
| CrossSection performance with many vertices | Low | Use `simplify()` for complex polygons |
| Frenet-Serret frame singularities in sweep | Medium | Detect degenerate frames; use parallel-transport fallback |
| Agent confused by 2D vs 3D naming | Low | Clear error messages; `circle2d` vs `cylinder` |

## Rollback Plan

Revert `forgecad-api.ts` to previous stub definitions. The `Sketch`/`Curve3D`/`surfacing` modules are additive; removing them restores the prior API surface. No database or external state changes.

## Dependencies

- `manifold-3d` v3.5.1+ (already installed)

## Success Criteria

- [ ] `rect(10, 5).extrude(2)` produces a valid `Shape` equivalent to `box(10, 5, 2)`
- [ ] `circle2d(3).extrude(10)` produces a valid `Shape` equivalent to `cylinder(10, 3)`
- [ ] `union2d(rect(10, 10), circle2d(3))` returns a valid `Sketch`
- [ ] `sweep(circle2d(2), spline3d([[0,0,0],[10,0,10],[20,10,20]]))` produces a watertight `Manifold`
- [ ] `loft([circle2d(2), circle2d(4), circle2d(2)])` produces a watertight `Manifold`
- [ ] All 40+ previously stubbed functions in `forgecad-api.ts` have real implementations
- [ ] `pnpm build` and `npx tsc --noEmit` pass with zero new errors
