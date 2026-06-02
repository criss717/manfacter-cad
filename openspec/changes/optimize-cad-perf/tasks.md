# Tasks: optimize-cad-perf

## Epic A: Draw Better — Prompt improvements & MODERATE tier (~120 LOC)

Feature flag: `EPIC_A_ENABLED` (default `true`). Disabling reverts classifier to `MODERATE` and suppresses GOTCHAS.

### A1. Implement tier classification heuristic

**Files:** `backend/agent/prompt.py`

- Add `Tier = Literal["SIMPLE", "MODERATE", "COMPLEX"]` type.
- Implement `classify_tier(text: str) -> Tier` using keyword heuristics:
  - **SIMPLE:** Box, Cylinder, Sphere, hole patterns on flat faces, chamfer, fillet, L-bracket, spacer, washer, plate, shaft; estimated code < 50 lines.
  - **MODERATE:** 5–11 features, no gears/sweeps/lofts/assemblies > 2 parts / BuildPart/BuildLine; default on ambiguity.
  - **COMPLEX:** gear/teeth, helical, sweep, loft, revolve, cam, spline, shell/hollow, text embossing, assemblies > 2, BuildPart/BuildSketch/BuildLine; OR code > 60 lines; OR > 400 chars with no explicit simple keywords.
- Log ambiguous classifications with request text and resolved tier.
- Add `FEATURE_KEYWORDS`, `COMPLEX_KEYWORDS`, `SIMPLE_KEYWORDS` module constants.
- **Verification:** unit test covering all 3 tiers + ambiguity fallback; golden fixture of 20 labeled requests.

### A2. Add versioned GOTCHAS block to system prompt

**Files:** `backend/agent/prompt.py`

- Add `GOTCHAS_VERSION = "1"` constant.
- Add `GOTCHAS` string constant (≤ 800 tokens) containing:
  - **Plane enum:** only `Plane.XY, Plane.YZ, Plane.XZ` exist; no `XN/XP/YN/YP/ZN/ZP`.
  - **edges()/faces():** must include parentheses.
  - **Fillet signature:** `shape.fillet(radius, [edge_list])`; difference vs global `fillet()`.
  - **Material removal:** cutting tools MUST overshoot target; fillets BEFORE holes/cuts; use `max_fillet()` after cuts.
  - **Manufacturing:** min 1.0 mm wall for FDM; 0.2 mm clearance on mating features.
- Append `## GOTCHAS` section after workflow instructions, before `## RESPONSE RULES`.
- Log `GOTCHAS_VERSION` in agent metadata.
- **Verification:** tokenize with Gemini tokenizer, assert ≤ 800 tokens; integration test confirms block present in assembled prompt.

### A3. Integrate tier-driven prompt directives

**Files:** `backend/agent/prompt.py`

- Embed tier-specific reference rules in assembled prompt:
  - SIMPLE/MODERATE: "NO references needed" (API cheatsheet already in prompt).
  - COMPLEX: "MANDATORY: call `read_reference("build123d-modeling.md")` FIRST".
- Add `MANDATORY_SNAPSHOT` directive keyed to COMPLEX tier only.
- Gate all tier logic on `is_epic_a_enabled()`.
- **Verification:** check prompt text at each tier via unit test; confirm no snapshot mandate for SIMPLE/MODERATE.

### A4. Create feature flags module

**Files:** `backend/agent/feature_flags.py` (new), `.env.example`

- Create `backend/agent/feature_flags.py` with:
  ```python
  def is_epic_a_enabled() -> bool: ...
  def is_epic_b_enabled() -> bool: ...
  def is_epic_c_enabled() -> bool: ...
  ```
- Read from env vars `EPIC_A_ENABLED`, `EPIC_B_ENABLED`, `EPIC_C_ENABLED` (default `"true"`).
- Document all three env vars in `.env.example`.
- **Verification:** unit test with env var set/unset; confirm defaults.

### A5. Wire tier to WebSocket event

**Files:** `backend/agent/server.py`

- Include `tier` string in every `agent_event` payload emitted to the client.
- Read tier from prompt assembly result or classify inline before first tool call.
- **Verification:** WS protocol test confirms `tier` field present in event JSON.

### A6. Display tier badge in frontend chat

**Files:** `src/chat/useCadChat.ts`

- Read `msg.tier` from WebSocket event.
- Render a tier badge (SIMPLE/MODERATE/COMPLEX) in the chat UI near the model result.
- Handle missing `tier` field gracefully (no badge).
- **Verification:** `pnpm lint` + `npx tsc --noEmit` pass; manual UI check with each tier.

---

## Epic B: Go Faster — Unified meshing, parallel exports, caching (~300 LOC)

Feature flag: `EPIC_B_ENABLED` (default `true`). Disabling reverts to dual-mesh path, skips cache + parallel phase.

### B1. Add MeshCache dataclass and `_mesh_once()` to generator

**Files:** `backend/cad_engine/generator.py`

- Add frozen `MeshCache` dataclass with fields: `vertices: np.ndarray`, `faces: np.ndarray`, `normals: np.ndarray`, `step_hash: str`, `deflection: tuple[float, float]`.
- Implement `_mesh_once(shape: TopoDS_Shape, lin_deflection: float, ang_deflection: float) -> MeshCache`:
  - Call `BRepMesh_IncrementalMesh(shape, lin_deflection, ang_deflection, True)` once.
  - Iterate `TopExp_Explorer` over faces once to collect vertices, face indices, normals.
  - Respect face `Orientation() == TopAbs_REVERSED` in winding order.
  - Store as contiguous numpy arrays (float64 vertices/normals, int32 faces).
- Gate on `is_epic_b_enabled()`.
- **Verification:** unit test round-trip; assert `BRepMesh_IncrementalMesh` call count = 1.

### B2. Create binary STL writer from cached arrays

**Files:** `backend/cad_engine/_stl_writer.py` (new)

- Implement `write_stl_binary(vertices: np.ndarray, faces: np.ndarray, normals: np.ndarray, path: str) -> None`:
  - Write 80-byte header + uint32 face count.
  - For each face: write normal (3× float32) + 3 vertices (9× float32) + uint16 attribute.
- Validate output is geometrically equivalent to `StlAPI_Writer` binary output for a 5-part fixture.
- **Verification:** golden STL comparison test with `StlAPI_Writer` reference files.

### B3. Refactor STL/GLB exports to consume MeshCache

**Files:** `backend/cad_engine/generator.py`, `backend/cad_engine/text_to_cad/glb_mesh_payload.py`

- Modify `_export_stl` to accept `MeshCache` and use `write_stl_binary`; remove internal `BRepMesh_IncrementalMesh`.
- Modify `scene_glb_mesh_payload` (or add new entry point) to accept pre-computed `MeshCache` instead of iterating `TopExp_Explorer` over faces.
- Remove `_extract_trimesh` internal mesh calls for GLB path.
- Gate on `is_epic_b_enabled()`.
- **Verification:** integration test — STL and GLB files for fixed 5-part fixture match reference outputs.

### B4. Parallelize STL + GLB export with ThreadPoolExecutor

**Files:** `backend/cad_engine/generator.py`

- After STEP export completes and `_mesh_once()` populates `MeshCache`, submit `_export_stl_from_cache` and `_export_glb_from_cache` to `concurrent.futures.ThreadPoolExecutor(max_workers=2)`.
- Await both futures; if one fails, log and still attempt the other.
- Wall-clock time for STL+GLB must be ≤ max(STL_time, GLB_time) + small overhead.
- Gate on `is_epic_b_enabled()`.
- **Verification:** timing test on 20-part fixture; wire mock to verify parallel submission.

### B5. Implement GLB session cache

**Files:** `backend/cad_engine/text_to_cad/glb_session_cache.py` (new)

- Create `GLBSessionCache` class:
  - `__init__(max_entries=20, max_bytes=50 * 1024 * 1024)`
  - `get(step_hash, deflection, model_id) -> bytes | None`
  - `put(step_hash, deflection, model_id, payload: bytes) -> None`
  - `clear() -> None`
- Composite key: `(step_hash, tuple[float, float], model_id)`.
- LRU eviction on entry count; total memory budget enforcement with LRU on overflow.
- Gate on `is_epic_b_enabled()`.
- **Verification:** unit test — cache hit/miss, LRU eviction at count limit, memory budget enforcement, `clear()`.

### B6. Add in-memory inspection path

**Files:** `backend/cad_engine/inspect.py`, `backend/cad_engine/generator.py`

- Add `inspect_shape(shape: TopoDS_Shape) -> dict` that reads bbox, solids, faces, edges, size from in-memory shape (no `STEPControl_Reader`).
- Modify `generate_cad` to return an opaque `shape_handle` token (e.g., session-scoped weakref key).
- In `inspect_geometry` tool, pass `shape_handle` to `inspect_shape` when available; fall back to `STEPControl_Reader.ReadFile` from disk STEP when handle is absent.
- Release handle at attempt end via weakref.
- Gate on `is_epic_b_enabled()`.
- **Verification:** parity test — `inspect_shape` output matches `inspect_step` for 10-part fixture.

### B7. Plumb tier-driven deflection through generator

**Files:** `backend/cad_engine/generator.py`, `backend/cad_engine/text_to_cad/step_scene.py`, `backend/agent/tools.py`

- In `backend/agent/tools.py`, pass `tier` from prompt assembly to `generate_cad(tier=...)`.
- In `generate_cad`, select deflection from `TIER_DEFLECTION` dict:
  - SIMPLE: `(0.1, 0.8)`, MODERATE: `(0.05, 0.5)`, COMPLEX: `(0.02, 0.3)`.
- Pass linear/angular deflection to `_mesh_once` and `mesh_step_scene` in `step_scene.py`.
- Gate on `is_epic_b_enabled()`.
- **Verification:** assert correct deflection values per tier in integration test; COMPLEX mesh has higher triangle count than SIMPLE.

### B8. Add model_id to generator result and session map

**Files:** `backend/cad_engine/generator.py`, `backend/agent/tools.py`

- In `generate_cad`, generate a 12-char hex `model_id` (sha256 of code truncated); include in return dict.
- In `backend/agent/tools.py`, add session-local `_code_by_mid: dict[sid, dict[mid, code]]` map.
- After successful `run_cad_code`, store code in `_code_by_mid[sid][model_id]`.
- Return `model_id` and `tier` in `run_cad_code` tool result JSON; keep `code` field present for now (dropped in Epic C).
- Gate on `is_epic_b_enabled()`.
- **Verification:** WS protocol test confirms `model_id` in event; code retrievable from session map.

### B9. Integrate GLB cache into export pipeline

**Files:** `backend/cad_engine/generator.py`, `backend/agent/server.py`

- Instantiate one `GLBSessionCache` per WebSocket session.
- In `_export_glb_from_cache`, check cache before computing GLB bytes; `put` after computation.
- Pass `GLBSessionCache` instance from `server.py` to generator (or inject via context).
- Gate on `is_epic_b_enabled()`.
- **Verification:** integration test — second export of same geometry hits cache (no mesh call).

---

## Epic C: Keep Quality — Guardrails, metrics gates, dimensional validation (~150 LOC)

Feature flag: `EPIC_C_ENABLED` (default `true`). Disabling keeps `code` in event, returns full inspection, skips dimensional check.

### C1. Truncate inspect_geometry on retry

**Files:** `backend/agent/tools.py`

- Track attempt count per session: `_attempt_counts[sid]` (reset to 0 per new user message).
- In `inspect_geometry` tool handler: when `attempt > 1`, return only `{"bbox": ..., "solids": int}` — omit face/edge counts.
- Gate on `is_epic_c_enabled()`.
- **Verification:** WS protocol test — first call returns full output, second call returns truncated.

### C2. Implement code re-hydration via model_id session map

**Files:** `backend/agent/tools.py`, `backend/agent/server.py`

- In `tools.py`: expose `read_reference("{model_id}/_script.py")` that retrieves code from `_code_by_mid[sid][model_id]`.
- In `server.py`: when LLM references `model_id` in retry context, re-hydrate code from session map before tool execution.
- Gate on `is_epic_c_enabled()`.
- **Verification:** retry scenario test — LLM references model_id, code retrieved correctly.

### C3. Drop code field from run_cad_code agent event

**Files:** `backend/agent/tools.py`, `backend/agent/server.py`

- When `is_epic_c_enabled()`, omit `code` from `run_cad_code` tool result JSON sent to LLM.
- Frontend `useCadChat.ts` must handle missing `data.code` without crash (Epic A task A6 already ensures graceful handling).
- Gate on `is_epic_c_enabled()`.
- **Verification:** WS protocol test — event payload contains `model_id` but not `code` when flag enabled; contains `code` when disabled.

### C4. Extract dimensional expectations from user request

**Files:** `backend/agent/prompt.py`

- Add `extract_expected_dims(text: str) -> dict | None` using regex:
  - `(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)` → length/width/height in mm.
  - `M(\d+)` → bolt diameter; default length from standard table or user mention.
  - `(\d+(?:\.\d+)?)\s*mm\s+(?:diameter|radius|length|width|height|depth)`.
- Store extracted dims in session-local `_last_expected_dims[sid]`.
- Log skip when no dimensions found.
- Gate on `is_epic_c_enabled()`.
- **Verification:** unit test with 15 labeled requests (explicit dims, M-bolt, no dims).

### C5. Add dimensional validation to inspection output

**Files:** `backend/cad_engine/inspect.py`, `backend/agent/tools.py`

- After inspection, compare `facts.bbox` against `_last_expected_dims[sid]`:
  - Compute per-axis deviations: `|actual - expected| / expected`.
  - Threshold: 20% per axis (configurable via `DIMENSIONAL_THRESHOLD` constant).
  - Output `dimensional_check` field: `{"expected": {...}, "actual": {...}, "deviations": {...}, "pass": bool}`.
- If mismatch: include repair hint with expected vs actual dimensions; count toward 13-attempt budget.
- Skip when no expected dims stored.
- Gate on `is_epic_c_enabled()`.
- **Verification:** integration test — pass within 20%, fail at exactly 20%, skip when no dims.

### C6. Extend error classification with material removal & manufacturing patterns

**Files:** `backend/agent/tools.py`

- Add error patterns to `classify_cad_error`:
  - Boolean subtraction fails with "does not intersect" → hint: "cutting tool must overshoot target completely".
  - Fillet fails on cut edges → hint: "apply fillets BEFORE boolean cuts; use `max_fillet()`".
  - Zero thickness in shell/subtraction → hint: "check minimum wall thickness (≥ 1.0 mm)".
- Preserve all 9 existing error categories unchanged.
- Link hints to corresponding GOTCHAS entry.
- Gate on `is_epic_c_enabled()`.
- **Verification:** unit test — all 9 existing categories still produce non-empty hints; 3 new patterns recognized.

### C7. Create metrics gate script

**Files:** `scripts/metrics_check.py` (new)

- Read last 200 runs from Postgres/Drizzle metrics table.
- Compute and emit:
  - `first_try_success_rate`: percentage of runs that succeed on attempt 1.
  - `p95_latency_seconds`: 95th percentile of total generation time.
  - `dim_efficacy`: percentage of off-by-≥20% bbox cases where repair was triggered.
  - `error_category_count`: distinct error categories matched.
- Compare against baseline; exit non-zero (fail CI) if:
  - Any metric regresses > 5% from baseline AND fails 2 consecutive checks.
- **Verification:** run against seeded fixture DB; assert zero exit on healthy data, non-zero on regression.

### C8. Wire EPIC_C feature flag to all gating points

**Files:** `backend/agent/feature_flags.py`

- `is_epic_c_enabled()` already created in A4; ensure it gates:
  - Code field omission in `run_cad_code` result (C3).
  - Inspection truncation on retry (C1).
  - Dimensional check in inspection (C5).
  - New error classification patterns (C6).
- **Verification:** toggle flag in integration test; confirm full inspection returns when disabled.

### C9. Cleanup session resources on WebSocket close

**Files:** `backend/agent/server.py`

- On WS close for session `sid`:
  - Clear `_code_by_mid[sid]` (free stored code strings).
  - Call `GLBSessionCache.clear()` for the session's cache instance.
  - Reset `_attempt_counts[sid]`.
  - Release any dangling `shape_handle` weakrefs.
- **Verification:** memory test — assert session maps empty after WS close; no leaked references.

---

## Chained PR Structure

| PR | Base | Epic | Files Changed | Est. LOC |
|----|------|------|---------------|----------|
| PR1 | main | A | `prompt.py`, `server.py`, `feature_flags.py`, `useCadChat.ts`, `.env.example` | ~120 |
| PR2 | PR1 | B | `generator.py`, `_stl_writer.py`, `glb_session_cache.py`, `glb_mesh_payload.py`, `step_scene.py`, `inspect.py`, `tools.py`, `server.py` | ~300 |
| PR3 | PR2 | C | `tools.py`, `server.py`, `prompt.py`, `inspect.py`, `feature_flags.py`, `scripts/metrics_check.py` | ~150 |

All three feature flags (`EPIC_A/B/C_ENABLED`) are defined once in `feature_flags.py` (created in PR1). Each PR gates its own behavior on its flag. Disabling any flag reverts that epic at request time without a deploy.
