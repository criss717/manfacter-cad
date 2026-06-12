# Proposal: ForgeCAD API Alignment

## Intent

Align ManfacterCAD's `src/cad/` API surface with ForgeCAD's class-based API to eliminate confusion, fix agent prompt errors, and replace outdated Python/build123d references with ForgeCAD MIT-licensed documentation. This is a hard break — no backward compatibility.

## Scope

### In Scope
- Convert `Shape` from interface to class with chainable methods
- Rename `subtract` → `difference`, `intersect` → `intersection`
- Change booleans from array-based to variadic: `union(...shapes)`, `difference(...shapes)`, `intersection(...shapes)`
- Implement `TrackedShape` with named faces for box and cylinder primitives
- Add stubs for `group`, `hull3d`, `fillet`, `chamfer`, `shell`, `linearPattern`, `circularPattern`
- Delete all 13 old `references/` Python/build123d docs
- Copy 18 ForgeCAD MIT-licensed docs to `references/`
- Fix `src/agent/prompt.ts` errors (parameter order, mirror normal, centered default, non-existent guide)
- Update `src/agent/tools.ts` sandbox bindings

### Out of Scope
- Full sketch/2D engine (`sketch.ts`)
- Sheet metal, assembly, joints
- Browser-based viewer
- Frontend UI changes, DB schema, auth changes

## Capabilities

### New Capabilities
- `tracked-shape`: Named faces for primitives (box, cylinder)
- `group`: Collection of shapes
- `patterns`: `linearPattern`, `circularPattern`
- `modifiers`: `hull3d`, `fillet`, `chamfer`, `shell` (stubs)

### Modified Capabilities
- `cad-primitives`: New parameter signatures (`box(x,y,z)`, `cylinder` with `radiusTop`, `segments`, `center`)
- `cad-booleans`: Variadic, renamed
- `cad-transforms`: Class methods instead of free functions
- `cad-inspection`: Method-based access
- `cad-export`: Method-based access
- `agent-prompt`: Correct parameter docs and ForgeCAD references
- `agent-tools`: Updated sandbox bindings

## Approach

- Keep `manifold-3d` as the internal engine; only change the API surface
- Implement `Shape` as a class with chainable methods (`translate`, `rotate`, `scale`, `mirror`)
- Implement `TrackedShape` extending `Shape` with named faces (top, bottom, front, back, left, right for box)
- Add `buildRectExtrusionTopology` and `buildCircleExtrusionTopology` for face tracking
- Free functions become wrappers around class methods or variadic calls
- Update `prompt.ts` to match actual API signatures and reference ForgeCAD docs
- Update `tools.ts` to export new API surface to agent sandbox
- Replace all 13 old reference docs with 18 ForgeCAD MIT-licensed docs

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cad/` | Modified | API surface changes to class-based, variadic, renamed |
| `src/cad/trackedShape.ts` | New | TrackedShape class with named faces |
| `src/agent/prompt.ts` | Modified | Fix errors, reference ForgeCAD docs |
| `src/agent/tools.ts` | Modified | Update sandbox bindings |
| `references/` | Removed/Added | Delete 13 old docs, add 18 ForgeCAD docs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking all existing CAD code | High | This is intentional; document migration in changelog |
| Agent confusion during transition | Med | Update prompts first, then code; test agent manually |
| TrackedShape complexity | Med | Minimal implementation: box/cylinder only; defer advanced faces |
| Reference docs mismatch | Low | Copy from MIT-licensed ForgeCAD kit; verify paths |

## Rollback Plan

- Revert `src/cad/` to last commit before this change
- Restore old `references/` from git history
- Restore `src/agent/prompt.ts` and `tools.ts` from git history
- All changes are in single commit for easy revert

## Dependencies

- ForgeCAD MIT-licensed docs in `forgecad-public-kit/skills/forgecad/docs/`
- `manifold-3d` npm package (already installed)

## Success Criteria

- [ ] `Shape` is a class with chainable methods matching ForgeCAD API
- [ ] `TrackedShape` provides named faces for box and cylinder
- [ ] All 13 old `references/` docs removed
- [ ] All 18 ForgeCAD docs copied to `references/`
- [ ] `prompt.ts` has no errors and references ForgeCAD docs
- [ ] `tools.ts` exports updated API to sandbox
- [ ] Agent can generate correct CAD code using new API
- [ ] All existing tests updated and passing
