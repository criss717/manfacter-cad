# Tasks: CAD Sketch Engine — Sketch 2D, Curves, Loft/Sweep

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~850 new + ~50 modified = ~900 total |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Sketch class + primitives + 2D ops. PR 2: Curve3D + Loft/Sweep. PR 3: Integration |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Sketch class + primitives + 2D booleans + extrude/revolve | PR 1 | Base = feature/cad-sketch-engine. ~350 lines. Self-contained `sketch.ts` |
| 2 | Curve3D + spline3d + loft + sweep | PR 2 | Base = PR 1 branch. Depends on Sketch. `curves.ts` + `surfacing.ts` (~600 lines) |
| 3 | Replace stubs + exports + verify | PR 3 | Base = PR 2 branch. `forgecad-api.ts`, `index.ts`, type-check. ~50 lines |

## Phase 1: Sketch Infrastructure + Primitives (sketch.ts)

- [x] 1.1 Create `src/cad/sketch.ts` — `Sketch` class wrapping `CrossSection`; immutable, `getCrossSection()` accessor, `area()`, `bounds()`, `setColor()`
- [x] 1.2 Implement `rect(w, h, center?)` — delegates to `CrossSection.square()`
- [x] 1.3 Implement `circle2d(r, center?, segments?)` — delegates to `CrossSection.circle()`
- [x] 1.4 Implement `roundedRect(w, h, radius, center?)` — polygon approximation via parametric math + `CrossSection.ofPolygons()`
- [x] 1.5 Implement `polygon(points[])` — `CrossSection.ofPolygons()` with collinear tolerance
- [x] 1.6 Implement `ngon(sides, radius, center?)` — parametric vertex generation
- [x] 1.7 Implement `ellipse(rx, ry, center?)` — parametric ellipse vertices
- [x] 1.8 Implement `slot(length, radius, center?)` — stadium shape via rect + 2 semicircles
- [x] 1.9 Implement `star(outerR, innerR, points, center?)` — parametric star vertices

## Phase 2: 2D Operations + Extrude/Revolve (sketch.ts)

- [x] 2.1 Implement `union2d(other)` — delegates to `CrossSection.add()`
- [x] 2.2 Implement `difference2d(other)` — delegates to `CrossSection.subtract()`
- [x] 2.3 Implement `intersection2d(other)` — delegates to `CrossSection.intersect()`
- [x] 2.4 Implement `hull2d(other)` — `CrossSection.hull()` or 2D monotone chain fallback
- [x] 2.5 Implement `offset(delta)` — delegates to `CrossSection.offset()`
- [x] 2.6 Implement `filletCorners(radius)` — offset-out/offset-in or polygon approximation
- [x] 2.7 Implement `extrude(height, divisions?)` — delegates to `CrossSection.extrude()`, returns `Shape`
- [x] 2.8 Implement `revolve(segments?)` — delegates to `CrossSection.revolve()`, returns `Shape`

## Phase 3: Curve3D + Spline (curves.ts)

- [x] 3.1 Create `src/cad/curves.ts` — `Curve3D` class with `readonly points`, `closed`, `tension`
- [x] 3.2 Implement `spline3d(points, options?)` — Catmull-Rom interpolation with closed/tension
- [x] 3.3 Implement `curve.sample(n)` — evenly-spaced parametric sampling, returns `Vec3[]`
- [x] 3.4 Implement `curve.length()` — arc length via segment-wise chord approximation
- [x] 3.5 Implement `curve.frames(n)` — Frenet-Serret frames; parallel-transport fallback for degenerate tangents
- [x] 3.6 Implement `curve.tangent(t)` — derivative of Catmull-Rom at parameter t

## Phase 4: Loft + Sweep Mesh Generation (surfacing.ts)

- [x] 4.1 Create `src/cad/surfacing.ts` — `loft()` and `sweep()` with triangle-strip mesh gen
- [x] 4.2 Implement `loft(profiles[], heights[])` — sort profiles, sample vertices, resample to match counts, connect rings with strips, cap ends
- [x] 4.3 Implement `sweep(profile, path)` — sample path, compute frames, project profile into each frame, connect strips, cap ends
- [x] 4.4 Implement `Manifold.ofMesh()` validation with union-approximation fallback for non-manifold
- [x] 4.5 Handle edge cases: mismatched profile/height counts, single profile, degenerate path segments

## Phase 5: Integration (forgecad-api.ts + index.ts)

- [x] 5.1 Replace `rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star` stubs in `forgecad-api.ts` — delegate to real `sketch.ts` implementations
- [x] 5.2 Replace `union2d`, `difference2d`, `intersection2d`, `hull2d`, `filletCorners` stubs — delegate to `Sketch` methods
- [x] 5.3 Replace `spline3d`, `Curve3D` stubs — delegate to `curves.ts`
- [x] 5.4 Replace `loft`, `sweep` stubs — delegate to `surfacing.ts`
- [x] 5.5 Remove `sketchStub()` / `curveStub()` helpers (keep for remaining unreplaced stubs: `Route3D`, `Blend`, `spline2d`, `constrainedSketch`, `sketchFromSvg`, `dxfSketch`, `svgSketch`)
- [x] 5.6 Export `Sketch`, `Curve3D`, `spline3d`, `loft`, `sweep` from `src/cad/index.ts`
- [x] 5.7 Verify `pnpm build` and `npx tsc --noEmit` pass with zero new errors

## Phase 6: Verification

- [ ] 6.1 Manual smoke test: `rect(10, 5).extrude(2)` produces box-like `Shape`
- [ ] 6.2 Manual smoke test: `circle2d(3).extrude(10)` produces cylinder-like `Shape`
- [ ] 6.3 Manual smoke test: `union2d(rect(10,10), circle2d(3))` returns valid `Sketch`
- [ ] 6.4 Manual smoke test: `sweep(circle2d(2), spline3d([[0,0,0],[10,0,10],[20,10,20]]))` produces watertight `Manifold`
- [ ] 6.5 Manual smoke test: `loft([circle2d(2), circle2d(4), circle2d(2)], [0,5,10])` produces watertight `Shape`
- [ ] 6.6 Verify all 40+ previously stubbed functions have real implementations