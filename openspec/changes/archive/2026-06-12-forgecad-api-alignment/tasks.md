# Tasks: ForgeCAD API Alignment

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1000 (src/) + ~4900 (references: 13 del + 18 add) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Shape class → PR 2: Core API → PR 3: Agent → PR 4: References |
| Delivery strategy | single PR with size:exception (maintainer approved) |
| Chain strategy | single PR |

Decision resolved: maintainer approved single PR with size:exception.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Shape class + TrackedShape + engine + types + primitives | single PR | new files, foundation |
| 2 | Booleans + Transforms + Export + Inspect + index.ts | single PR | depends on unit 1 |
| 3 | Agent tools + prompt fixes | single PR | depends on unit 1+2 |
| 4 | References migration (del+add+SKILL.md) | single PR | independent of code changes |

## Phase 1: Foundation (src/cad/ core)

- [x] 1.1 Create `src/cad/shape.ts` — immutable `Shape` class with transforms (translate, rotate(axis,angleDeg), scale, mirror, moveTo), inspect (boundingBox, volume, surfaceArea, isEmpty, numTri), export (toSTL, toGLB, toSTEP), appearance (color, material), stubs (fillet, chamfer, shell, linearPattern, circularPattern), and chainable API
- [x] 1.2 Create `src/cad/trackedShape.ts` — `TrackedShape extends Shape` with `face(name)`, `faceNames()`, named faces for box (top/bottom/front/back/left/right) and cylinder (top/bottom/side), plus `buildRectExtrusionTopology` / `buildCircleExtrusionTopology`
- [x] 1.3 Update `src/cad/types.ts` — remove `Shape` interface, add `FaceRef`, `EdgeRef`, `ShapeGroup` types
- [x] 1.4 Refactor `src/cad/engine.ts` — `buildShapeFromManifold` becomes private to Shape class; export only `initEngine`, `getManifold`

## Phase 2: Core API (primitives, booleans, transforms)

- [x] 2.1 Rewrite `src/cad/primitives.ts` — `box(x,y,z)` returns `TrackedShape`, centered XY/Z-0; `cylinder(height, radius, radiusTop?, segments?)` returns `TrackedShape`; `sphere(radius, segments?)`; `torus(majorRadius, minorRadius, segments?)`
- [x] 2.2 Rewrite `src/cad/booleans.ts` — variadic `union(...shapes)`, `difference(...shapes)` (base + cutters), `intersection(...shapes)`; no-op single shape; drop old `subtract`, `intersect`
- [x] 2.3 Rewrite `src/cad/transforms.ts` — free functions delegate to Shape methods: `translate(s,x,y,z) => s.translate(x,y,z)`, same for rotate/scale/mirror

## Phase 3: Inspect, Export, Params, Index

- [x] 3.1 Rewrite `src/cad/inspect.ts` — free functions delegate to Shape methods (`getBoundingBox(s) => s.boundingBox()`, etc.); keep `checkCollisions`, `renderSnapshot`
- [x] 3.2 Rewrite `src/cad/export.ts` — free functions delegate to Shape methods (`toSTL(s) => s.toSTL()`, etc.)
- [x] 3.3 Update `src/cad/index.ts` — export `Shape`, `TrackedShape` classes; export `difference`, `intersection` (not subtract/intersect); remove free-function exports that are now methods

## Phase 4: Agent Integration

- [x] 4.1 Update `src/agent/tools.ts` — replace `subtract`→`difference`, `intersect`→`intersection` in sandbox; export `Shape`, `TrackedShape` constructors; update `__CAD_RESULT` type check for Shape/TrackedShape/ShapeGroup
- [x] 4.2 Fix `src/agent/prompt.ts` — cylinder param order (height,radius), mirror normal vector, remove box "center at origin" claim, remove build123d/manifold-guide refs, add ForgeCAD doc references, update GOTCHAS for variadic booleans and class transforms
- [x] 4.3 Validate reference file list at startup — scan `references/` dir, include only existing files in prompt

## Phase 5: References Migration

- [x] 5.1 Delete 13 old reference docs from `references/` (keep SKILL.md for now)
- [x] 5.2 Copy 18 ForgeCAD MIT docs from `forgecad-public-kit/skills/forgecad/docs/` to `references/` (API/core/concepts.md, CLI.md, generated/*.md, guides/*.md)
- [x] 5.3 Rewrite `references/SKILL.md` — replace build123d/Python content with ForgeCAD-aligned instructions

## Phase 6: Verification

- [x] 6.1 Run `npx tsc --noEmit` — verify all type errors resolved (only pre-existing .next validator error remains)
- [x] 6.2 Manual test: `box(10,10,5).translate(0,0,5)` → verify GLB output and face queries
- [x] 6.3 Manual test: `difference(cylinder(10,3), box(5,5,5))` → verify boolean works
- [x] 6.4 Verify all 18 ForgeCAD docs are readable via `readReference()` tool