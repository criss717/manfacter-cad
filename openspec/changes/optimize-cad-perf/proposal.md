# Proposal: optimize-cad-perf

## Intent

Complex-part generation runs 30–120s and the AI's first attempt is often invalid. Tighten the loop on three axes: prompts that steer toward manufacturable code, an engine that meshes and exports once, and guardrails that preserve the 13-attempt repair loop and error-classification coverage.

## Scope

### In Scope
- New MODERATE tier (between SIMPLE/COMPLEX) that skips `read_reference` for medium parts.
- Inline top build123d error patterns as prompt gotchas; embed material-removal best practices (overshoot cut cylinders, fillet cut edges) and manufacturing constraints (min wall, stock allowance).
- Mandate `make_snapshot` for COMPLEX tier; add post-export dimensional check (bbox vs. request → repair on mismatch).
- Unify `BRepMesh_IncrementalMesh` (mesh once, reuse triangulation for STL+GLB); parallelize STL/GLB via `ThreadPoolExecutor`.
- Eliminate STEP re-read in inspection (reuse in-memory `TopoDS_Shape`); truncate `inspect_geometry` on retry; replace full code-in-message with `model_id` (sha256).
- Per-session GLB cache keyed by `(step_hash, deflection, model_id)`; tier-driven deflection (SIMPLE coarse, MODERATE default, COMPLEX fine).
- Gate every change on `first_try_success_rate` and `p95_latency_seconds`; roll back if either regresses > 5%.

### Out of Scope
- Model-provider swap, new export formats, frontend UX, cross-user caching, rewriting the 13-attempt loop.

## Capabilities

### New Capabilities
- `cad-tier-classification`: SIMPLE/MODERATE/COMPLEX from keyword heuristics; drives references, deflection, snapshot rule.
- `engine-mesh-reuse`: one mesh per export; STL/GLB/inspection share triangulation.
- `prompt-quality-gotchas`: versioned GOTCHAS block (material removal, manufacturing, top errors) in system prompt.
- `dimensional-validation`: post-export bbox-vs-request check; triggers repair on mismatch.
- `glb-session-cache`: GLB bytes cached per session by `(step_hash, deflection, model_id)`.

### Modified Capabilities
- `cad-repair-loop`: truncated tool results, `model_id` reference, snapshot mandated for COMPLEX.
- `cad-error-classification`: coverage must remain ≥ current taxonomy (metrics-enforced).

## Approach

Tier classification runs in `agent/prompt.py` from keyword heuristics (feature count, "assembly"/"boolean"/"fillet" tokens, request length) before the first `run_cad_code`. Tier selects references, deflection, and snapshot rule.

`generator.py` gets `_mesh_once(shape)` (one `BRepMesh_IncrementalMesh` call, cached vertex/face arrays). STL writes from cached triangles; GLB writes the same via `glb_mesh_payload.py`. STEP keeps its own mesh (XCAF). STL and GLB run in parallel on `ThreadPoolExecutor(max_workers=2)`.

Inspection becomes in-memory: `run_cad_code` returns the `TopoDS_Shape` handle alongside paths; `inspect_geometry` operates on it directly, removing the `STEPControl_Reader` round-trip.

Prompt changes are additive: `GOTCHAS` block (≤ 800 tokens) appended to `agent/prompt.py`; `MANDATORY_SNAPSHOT` keyed by tier. `run_cad_code` returns `{model_id, urls, facts}`; `agent/server.py` re-hydrates code from a session-local map on retry.

Metrics gating: `scripts/metrics_check.py` reads last 200 runs, computes first-try success and p95 latency, compares to baseline.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/agent/prompt.py` | Modified | GOTCHAS, tier refs, snapshot rule. |
| `backend/agent/tools.py` | Modified | `model_id` in result; truncate inspection. |
| `backend/agent/server.py` | Modified | Re-hydrate code from session map. |
| `backend/cad_engine/generator.py` | Modified | Mesh once; parallel STL/GLB; tier deflection. |
| `backend/cad_engine/inspect.py` | Modified | In-memory; remove STEP re-read. |
| `backend/cad_engine/text_to_cad/glb_mesh_payload.py` | Modified | Pre-triangulated mesh; session cache. |
| `backend/cad_engine/text_to_cad/step_scene.py` | Modified | Plumb caller deflection. |
| `scripts/metrics_check.py` | New | First-try + p95 gate. |
| `src/chat/useCadChat.ts` | Modified | Handle `model_id`; display tier. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Single mesh lowers STL quality on COMPLEX | Med | Fine-deflection default; A/B on 50-part sample. |
| Tier misclassifies → wrong references | Med | Default MODERATE on ambiguity; log for review. |
| ThreadPool exposes GIL-bound OCP sections | Low | Measure 20-part sample; revert if STL+GLB total regresses. |
| `TopoDS_Shape` handle leaks across sessions | Low | Release after inspection; session weakref cache. |
| GOTCHAS overflows prompt budget | Med | Cap at 800 tokens; low-priority stays in `read_reference`. |
| Metrics gate trips on noisy baseline | Med | Rolling 200-run window; require 2 consecutive failures. |
| GLB cache stale on edit | Low | Key includes `model_id`; invalidates on code change. |

## Rollback Plan

Each epic gated by an independent feature flag (`EPIC_A_ENABLED`, `EPIC_B_ENABLED`, `EPIC_C_ENABLED`, default `true`). Disabling reverts at request time without redeploy. Full rollback: revert merge commit; metrics harness is additive and stays. 13-attempt loop, error classification, and tool signatures preserved → clients stay compatible during rollback.

## Dependencies

- Google ADK / Gemini tool-calling supports `model_id`-style references.
- `OCP.BRepMesh_IncrementalMesh` as shared triangulation entry point.
- Existing metrics pipeline (Postgres via Drizzle).

## Success Criteria

- [ ] p95 latency for COMPLEX drops ≥ 30% from baseline.
- [ ] First-try success rate increases ≥ 10 pp on a fixed 50-part benchmark.
- [ ] MODERATE cuts avg prompt tokens ≥ 25% for medium parts.
- [ ] 13-attempt loop preserved; no reduction in max attempts.
- [ ] Error-classification coverage ≥ current count.
- [ ] Dimensional validation triggers repair in ≥ 80% of off-by-≥20% bbox mismatches.
- [ ] No regression in `pnpm lint` or `npx tsc --noEmit`.
- [ ] Metrics gate passes on rolling 200-run window for 7 consecutive days.
