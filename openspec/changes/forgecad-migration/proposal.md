# Proposal: ForgeCAD Migration — Python/build123d to TypeScript/manifold-3d

## Proposal Question Round

Three questions surfaced during shaping. Assumptions used below (correct if needed):

1. **Image analysis pipeline**: Assumed full migration (Kimi + MiniMax) in Phase 4.
2. **Error classification remap**: Allow organic evolution — start with ≥5 manifold-3d categories, grow from real failures. Not bound to 1:1 with 9 build123d categories.
3. **engine-mesh-reuse spec**: MODIFIED (preserve single-mesh-reuse intent, rewrite mechanism for manifold's native mesh).

## Intent

Replace the Python/FastAPI CAD backend (build123d + OpenCASCADE) with a pure TypeScript engine (manifold-3d + opencascade.js) inside the Next.js app. Eliminates Python runtime dependency, simplifies deployment to a single process, and removes the complexity ceiling of build123d for complex geometries.

## Scope

### In Scope
- `src/cad/` module: manifold-3d wrapper (primitives, booleans, transforms, mesh export)
- `src/agent/` module: TS agent with multi-provider dispatch (OpenCode Zen, Anthropic, Gemini)
- WebSocket route via next-ws: single WS endpoint replacing 3 Python servers
- CAD tools in TS: runCadCode, inspectGeometry, makeSnapshot, readReference, listOutputs
- STEP export via opencascade.js (LGPL-2.1, user-approved)
- STL/GLB export via manifold-3d mesh + three.js/fflate
- CAD agent prompt rewrite for manifold-3d JS API
- Image analysis pipeline migration (Kimi + MiniMax dual-analysis)

### Out of Scope
- ForgeCAD DSL / compile plan IR (direct API calls only)
- Browser-based CAD editor
- Assembly solver, sheet metal, constraints
- Frontend UI changes, DB schema, auth
- Python backend modification (read-only until deletion after validation)

## Capabilities

### New Capabilities
- `cad-engine-ts`: Manifold-3d wrapper — primitives, booleans, transforms, mesh/STEP/GLB/STL export, inspection
- `cad-agent-ts`: TS agent server — next-ws WebSocket, multi-provider dispatch, tool-calling loop, image analysis

### Modified Capabilities
- `cad-repair-loop`: Session map → TS Map; model_id + 13-attempt budget preserved
- `cad-tier-classification`: Keywords updated for manifold-3d API; tier-driven deflection adapted for manifold mesh settings
- `cad-error-classification`: Build123d categories → manifold-3d error patterns (≥5 initial, organic growth); GOTCHAS linkage preserved
- `dimensional-validation`: Implementation in TS; bbox comparison logic unchanged
- `engine-mesh-reuse`: BRepMesh_IncrementalMesh → manifold native mesh; single-mesh-reuse concept preserved, mechanism rewritten
- `glb-session-cache`: Cache key adapted (manifold mesh hash replaces step_hash); LRU eviction preserved
- `prompt-quality-gotchas`: Build123d patterns → manifold-3d JS API patterns; token budget (≤800) preserved

## Approach

**Phase 1**: CAD engine core — `src/cad/` with manifold-3d wrapper, primitives, booleans, transforms, STL/GLB export
**Phase 2**: Agent & tools — `src/agent/` with next-ws WebSocket, multi-provider dispatch, 5 CAD tools
**Phase 3**: Export pipeline — STEP via opencascade.js (lazy WASM load), STL/GLB/PNG snapshot
**Phase 4**: Prompt porting — agent prompt rewrite, tier classification, repair loop, error classification, image analysis
**Phase 5**: Integration — wire frontend to new WS endpoint, validate parity, delete `backend/`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cad/` | New | CAD engine module (~2,500 lines) |
| `src/agent/` | New | Agent module (~800 lines) |
| `src/app/api/ws/cad/` | New | WebSocket route |
| `src/chat/useCadChat.ts` | Modified | WS target URL change |
| `src/lib/cadGeneration.ts` | Modified | Replace stub with engine calls |
| `package.json` | Modified | Add manifold-3d, opencascade.js, next-ws |
| `next.config.ts` | Modified | serverExternalPackages for WASM |
| `backend/` | Removed | After validation (manual deletion) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Manifold-3d mesh quality vs OCP | Med | Deflection tuning; STEP fallback via OCCT |
| opencascade.js WASM 13MB cold start | Med | Lazy load; server-side memory cache |
| next-ws less battle-tested than Python | Low | Feature flag; can switch to raw `ws` |
| Agent prompt retuning for JS API | Med | Iterative prompt refinement; GOTCHAS v2 |
| No test safety net | High | Manual validation; add vitest in Phase 1 |

## Rollback Plan

Python backend stays untouched during implementation. New WS endpoint on separate port during dev. Feature flag (`NEXT_PUBLIC_USE_FORGECAD`) switches frontend between old/new engine. Revert = toggle flag + redeploy.

## Dependencies

- manifold-3d v3.5.1 (MIT)
- opencascade.js v1.1.1 (LGPL-2.1, user-approved)
- next-ws (npm)
- three.js / fflate (already in project)

## Success Criteria

- [ ] Agent generates valid manifold-3d code with ≥ current success rate
- [ ] STEP/STL/GLB export parity with build123d output
- [ ] Latency comparable or better (no Python process overhead)
- [ ] Net LOC reduction from Python backend deletion
- [ ] All 7 existing spec behaviors preserved in TS implementation
