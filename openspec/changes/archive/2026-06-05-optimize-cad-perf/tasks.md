# Tasks: optimize-cad-perf

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 570 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (Epic A) -> PR2 (Epic B) -> PR3 (Epic C) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Epic A: Prompt Improvements & MODERATE Tier | PR1 | Base: main |
| 2 | Epic B: Go Faster — Unified meshing, parallel exports, caching | PR2 | Base: PR1 |
| 3 | Epic C: Keep Quality — Guardrails, metrics gates, validation | PR3 | Base: PR2 |

## Phase 1: Epic A: Draw Better — Prompt improvements & MODERATE tier (~120 LOC)

- [x] A1. Implement tier classification heuristic in `backend/agent/prompt.py`
- [x] A2. Add versioned GOTCHAS block to system prompt in `backend/agent/prompt.py`
- [x] A3. Integrate tier-driven prompt directives in `backend/agent/prompt.py`
- [x] A4. Create feature flags module in `backend/agent/feature_flags.py`
- [x] A5. Wire tier to WebSocket event in `backend/agent/server.py`
- [x] A6. Display tier badge in frontend chat in `src/chat/useCadChat.ts`

## Phase 2: Epic B: Go Faster — Unified meshing, parallel exports, caching (~300 LOC)

- [x] B1. Add MeshCache dataclass and `_mesh_once()` to generator in `backend/cad_engine/generator.py`
- [x] B2. Create binary STL writer from cached arrays in `backend/cad_engine/_stl_writer.py`
- [x] B3. Refactor STL/GLB exports to consume MeshCache in `backend/cad_engine/generator.py`
- [x] B4. Parallelize STL + GLB export with ThreadPoolExecutor in `backend/cad_engine/generator.py`
- [x] B5. Implement GLB session cache in `backend/cad_engine/text_to_cad/glb_session_cache.py`
- [x] B6. Add in-memory inspection path in `backend/cad_engine/inspect.py`
- [x] B7. Plumb tier-driven deflection through generator in `backend/cad_engine/generator.py`
- [x] B8. Add model_id to generator result and session map in `backend/cad_engine/generator.py`
- [x] B9. Integrate GLB cache into export pipeline in `backend/cad_engine/generator.py`

## Phase 3: Epic C: Keep Quality — Guardrails, metrics gates, dimensional validation (~150 LOC)

- [x] C1. Truncate inspect_geometry on retry in `backend/agent/tools.py`
- [x] C2. Implement code re-hydration via model_id session map in `backend/agent/tools.py`
- [x] C3. Drop code field from run_cad_code agent event in `backend/agent/tools.py`
- [x] C4. Extract dimensional expectations from user request in `backend/agent/prompt.py`
- [x] C5. Add dimensional validation to inspection output in `backend/cad_engine/inspect.py`
- [x] C6. Extend error classification with material removal & manufacturing patterns in `backend/agent/tools.py`
- [x] C7. Create metrics gate script in `scripts/metrics_check.py`
- [x] C8. Wire EPIC_C feature flag to all gating points in `backend/agent/feature_flags.py`
- [x] C9. Cleanup session resources on WebSocket close in `backend/agent/server.py`
