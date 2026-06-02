# Design: optimize-cad-perf

## Technical Approach

Three layered changes flow from prompt to engine to guardrails. Tier classification runs first in `backend/agent/prompt.py` and threads a `tier` string through the prompt directive, the `run_cad_code` tool arg, the generator's deflection selection, and the WebSocket event for frontend display. The generator pipeline collapses to a single `BRepMesh_IncrementalMesh` call whose numpy arrays feed STL and GLB writers in parallel on a `ThreadPoolExecutor`. Inspection switches to an in-memory `TopoDS_Shape` handle, removing the STEP round-trip. The agent stops re-embedding source code in tool results; a session-local `_code_by_mid` map re-hydrates it on retry. Feature flags gate each epic independently for request-time rollback.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Mesh ownership | Single `_mesh_once(shape, lin, ang)` populates a frozen `MeshCache` (vertices int/float64, faces int32, normals float64) consumed by STL + GLB | (a) keep dual calls, (b) asyncio loop | One OCP traversal; numpy arrays are read-only so thread safety is free; avoids GIL contention on STL/GLB I/O |
| 2 | STL writer | Replace internal `BRepMesh`+`StlAPI_Writer` with binary STL writer built from cached triangles | (a) keep `StlAPI_Writer` after a fresh mesh, (b) trimesh `export('stl')` | Binary writer is ~3× faster on complex parts and skips a second mesh pass; format identical to `StlAPI_Writer` binary output |
| 3 | Parallelism surface | `ThreadPoolExecutor(max_workers=2)` wrapping `_export_stl` and `_export_glb` after STEP completes | (a) `ProcessPoolExecutor`, (b) asyncio tasks | STL/GLB are I/O + numpy-bound (no OCP state); threads avoid pickling the OCP handle; total ≈ max(STL, GLB) + overhead |
| 4 | Inspection path | Plumb the in-memory `TopoDS_Shape` from `generate_cad` back to the tool layer; `inspect_geometry` accepts an optional `shape_handle` token; disk STEP remains the fallback | (a) keep STEP re-read, (b) pickle handle | Avoids the `STEPControl_Reader.ReadFile` round-trip on every retry; handle is freed at attempt end via weakref |
| 5 | Tier classifier location | Pure-Python function `classify_tier(text)` in `prompt.py` returning `Literal["SIMPLE","MODERATE","COMPLEX"]` | (a) LLM-driven, (b) regex table | Deterministic, debuggable, no extra model cost; runs at prompt-assembly time inside the same process |
| 6 | GOTCHAS delivery | Versioned constant `GOTCHAS = "..."` (≤800 tokens) concatenated into `CAD_AGENT_PROMPT` after the workflow block, before `## RESPONSE RULES`; version logged in agent metadata | (a) `read_reference` only, (b) per-tier variants | Per-tier would multiply token cost; one block keeps SIMPLE/MODERATE prompt lean and still injects for COMPLEX |
| 7 | `model_id` plumbing | `run_cad_code` returns `model_id` only; full code stored in `tools._code_by_mid[sid][mid]`; `read_reference` already supports `{mid}/_script.py` for re-hydration | (a) keep `code` field, (b) hash the code into `model_id` (already happens via `uuid`) | Mirrors the existing `read_reference` contract; spec requires `model_id` to be a 12-char hex so the code remains re-hydratable |
| 8 | GLB cache | New `GLBSessionCache` in `text_to_cad/glb_session_cache.py`, keyed by `(step_hash, (lin, ang), model_id)`, bounded LRU(20) + 50 MB; cleared on WS close | (a) `functools.lru_cache` global, (b) Redis | Per-session, in-process, no eviction surprise; cross-session is out of scope per spec |
| 9 | Feature flags | `backend/agent/feature_flags.py` reads `EPIC_A_ENABLED`, `EPIC_B_ENABLED`, `EPIC_C_ENABLED` (env, default `true`); gate functions `is_epic_a/b/c_enabled()` checked at prompt assembly, generator entry, and inspect entry | (a) per-tier flags, (b) DB-backed | Independent epic rollback is the explicit ask; env keeps ops simple |
| 10 | Metrics gate | New `scripts/metrics_check.py` reads last 200 runs from Postgres (Drizzle), computes first-try success + p95 latency + dimensional-efficacy; CI exits non-zero on >5% regression or 2 consecutive failures | (a) Prometheus, (b) ad-hoc | Existing metrics pipeline (Postgres + Drizzle) is the source of truth; rolling window avoids single-day noise |

## Data Flow

### Generation pipeline (Epic B happy path)

```
user message
  │
  ▼
agent/prompt.py ── classify_tier(text) ──► tier
  │                                          │
  │   inject tier-specific directives        │ append GOTCHAS block
  ▼                                          ▼
ADK Runner  ──► run_cad_code(tier=..., code=...)
  │                       │
  │                       ▼
  │             cad_engine/generator.py
  │                       │
  │             gen_step() ──► TopoDS_Shape
  │                       │
  │             _export_step(shape)         (XCAF, own mesh)
  │                       │
  │             _mesh_once(shape, lin, ang) ──► MeshCache (numpy)
  │                       │              ▲
  │                       │              └─ shared with inspect_step_in_memory
  │                       │
  │             ThreadPoolExecutor(max_workers=2):
  │               ├─ _export_stl_from_cache(MeshCache)
  │               └─ _export_glb_from_cache(MeshCache) ──► GLBSessionCache.put
  │                       │
  │                       ▼
  │             {ok, model_id, step_url, stl_url, glb_url, facts, tier}
  │
  ▼
agent/server.py ── _code_by_mid[sid][mid] = code   (no code in event)
  │
  ▼
WebSocket event: {tool_result, model_id, tier}  ──► useCadChat.ts
```

### Retry path (Epic C)

```
LLM references {mid}
  │
  ▼
read_reference("{mid}/_script.py")
  │   guards: current_model == mid  (existing)
  ▼
returns source code (re-hydration)

inspect_geometry(step_path, attempt=N)
  │   if attempt > 1: return {bbox, solids} only
  │   if expected_dims known: append dimensional_check
  │   if shape_handle in session: use in-memory (no STEP re-read)
  │   else: fall back to STEPControl_Reader
  ▼
  │   if bbox deviates ≥ 20% per axis: return expected vs actual
  │      (counts as 1 attempt; 13-attempt budget unchanged)
```

### Dimensional validation (Epic C)

```
prompt.py: parse user_text → expected_dims (regex: "\d+(\.\d+)?\s*x\s*\d+(\.\d+)?\s*x\s*\d+(\.\d+)?",
                                       M\d+ diameter, mm units)
        │
        ▼
generate_cad stores expected_dims in _last_expected[sid]
        │
        ▼
inspect_geometry(step_path)
   facts = inspect_step_in_memory(shape)  (or STEP re-read fallback)
   if expected_dims: dimensional_check = compare(facts.size, expected_dims, threshold=0.20)
   if any axis |dev| ≥ 0.20: include repair hint
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/agent/prompt.py` | Modify | Add `GOTCHAS` constant + `GOTCHAS_VERSION`; add `classify_tier()`; inject tier directive + `MANDATORY_SNAPSHOT`; place block after workflow, before RESPONSE RULES |
| `backend/agent/tools.py` | Modify | Drop `code` from `run_cad_code` JSON; add `_code_by_mid` session map; truncate `inspect_geometry` on attempt > 1; store `_last_expected_dims`; pass `model_id` to re-hydration |
| `backend/agent/server.py` | Modify | Emit `tier` and `model_id` in `agent_event`; clean up `_code_by_mid[sid]` and GLB cache on WS close |
| `backend/agent/feature_flags.py` | Create | `EPIC_A/B/C_ENABLED` env readers + `is_epic_a/b/c_enabled()` |
| `backend/cad_engine/generator.py` | Modify | Add `_mesh_once()`; refactor `_export_stl/_export_glb` to read from `MeshCache`; add `ThreadPoolExecutor(max_workers=2)`; accept `tier` param → deflection; return in-memory `shape_handle` token |
| `backend/cad_engine/inspect.py` | Modify | Add `inspect_shape(shape)` for in-memory path; keep `inspect_step(path)` as fallback; add `expected_dims`/`dimensional_check` fields |
| `backend/cad_engine/text_to_cad/glb_mesh_payload.py` | Modify | Accept pre-computed `MeshCache` instead of iterating `TopExp_Explorer`; keep `scene_glb_mesh_payload` for selector callers |
| `backend/cad_engine/text_to_cad/step_scene.py` | Modify | `mesh_step_scene` reads `linear/angular` from caller; thread deflection through to mesh signature |
| `backend/cad_engine/text_to_cad/glb_session_cache.py` | Create | `GLBSessionCache` class (LRU 20 / 50 MB), key `(step_hash, (lin, ang), model_id)`, get/put/clear |
| `backend/cad_engine/_stl_writer.py` | Create | Binary STL writer from cached numpy vertices/faces |
| `scripts/metrics_check.py` | Create | Read last 200 runs from Drizzle/Postgres; emit first-try %, p95 latency, dimensional-efficacy, error-category coverage; exit non-zero on regression |
| `src/chat/useCadChat.ts` | Modify | Drop `data.code` reliance; render tier badge from `msg.tier`; `attemptCount > 1` already handled via existing modal |
| `.env.example` | Modify | Document `EPIC_A_ENABLED`, `EPIC_B_ENABLED`, `EPIC_C_ENABLED` (default `true`) |
| `backend/references/material-removal-gotchas.md` | Create | Optional: overflow GOTCHAS to references when budget tight |

## Interfaces / Contracts

```python
# backend/agent/prompt.py
Tier = Literal["SIMPLE", "MODERATE", "COMPLEX"]
GOTCHAS_VERSION = "1"
TIER_DEFLECTION: dict[Tier, tuple[float, float]] = {
    "SIMPLE":   (0.1,  0.8),
    "MODERATE": (0.05, 0.5),
    "COMPLEX":  (0.02, 0.3),
}
def classify_tier(text: str) -> Tier: ...

# backend/cad_engine/generator.py
@dataclass(frozen=True)
class MeshCache:
    vertices: np.ndarray  # (N, 3) float64
    faces:    np.ndarray  # (M, 3) int32
    normals:  np.ndarray  # (N, 3) float64
    step_hash: str
    deflection: tuple[float, float]

def generate_cad(code: str, model_id: str | None = None,
                 tier: Tier = "MODERATE",
                 expected_dims: dict | None = None) -> dict:
    # returns {success, model_id, step_url, stl_url, glb_url,
    #          facts, shape_handle: str, tier}

# backend/cad_engine/text_to_cad/glb_session_cache.py
class GLBSessionCache:
    def __init__(self, max_entries: int = 20,
                 max_bytes: int = 50 * 1024 * 1024): ...
    def get(self, step_hash: str, deflection: tuple[float, float],
            model_id: str) -> bytes | None: ...
    def put(self, step_hash: str, deflection: tuple[float, float],
            model_id: str, payload: bytes) -> None: ...
    def clear(self) -> None: ...

# backend/agent/feature_flags.py
def is_epic_a_enabled() -> bool: ...  # prompt + GOTCHAS
def is_epic_b_enabled() -> bool: ...  # mesh reuse + parallel + cache
def is_epic_c_enabled() -> bool: ...  # truncation + model_id + dims

# run_cad_code JSON (drop 'code')
{"ok": bool, "glb_url": str|null, "step_url": str|null, "stl_url": str|null,
 "facts": {...}, "model_id": "abc123def456", "tier": "MODERATE",
 "error"?: str, "hint"?: str, "expected_dims"?: {...}}

# inspect_geometry JSON (truncated when attempt > 1)
{"ok": true, "facts": {"bbox": {...}, "solids": int,
                       "dimensional_check"?: {"expected": {...}, "actual": {...},
                                              "deviations": {...}, "pass": bool}}}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (Python) | `classify_tier()` keyword matrix; `MeshCache` round-trip; STL binary writer equivalence vs `StlAPI_Writer`; `GLBSessionCache` LRU eviction; `inspect_shape` parity with `inspect_step`; GOTCHAS token count | `pytest` under `backend/tests/`; golden vector files for tier classifier |
| Integration | `generate_cad(tier=...)` produces equivalent STL for fixed 5-part fixture at MODERATE deflection; first-mesh call count = 1; STL+GLB wall-clock < serial sum by ≥20% | Run 20-part fixture, assert `mock.call_count` on `BRepMesh_IncrementalMesh` |
| WS protocol | Event includes `model_id` + `tier`; retry via `read_reference("{mid}/_script.py")` returns original code; `inspect_geometry` truncates after attempt 1 | `pytest-asyncio` against `agent_session` with stub ADK |
| Metrics | `scripts/metrics_check.py` against seeded Drizzle DB: emits correct first-try/p95/efficacy; non-zero exit when regression > 5% | Fixture SQL inserts |
| Frontend | `useCadChat.ts` renders tier badge; missing `data.code` doesn't crash | `pnpm lint` + `npx tsc --noEmit` (per config rules) |
| E2E manual | 50-part fixed benchmark: p95 ↓ ≥ 30% on COMPLEX; first-try ↑ ≥ 10 pp; 13-attempt loop preserved; feature flags revert behavior at request time | Per `successCriteria` in proposal |

## Migration / Rollout

No schema migration. Three independent feature flags (`EPIC_A_ENABLED`, `EPIC_B_ENABLED`, `EPIC_C_ENABLED`, env default `true`) allow per-epic kill switches. Flags are read at request time (no restart):

- `EPIC_B_ENABLED=False` → generator falls back to current dual-mesh path; cache + parallel phase skipped.
- `EPIC_C_ENABLED=False` → `run_cad_code` keeps `code` field; `inspect_geometry` returns full output; no dimensional check.
- `EPIC_A_ENABLED=False` → classifier returns `MODERATE`; GOTCHAS block not appended.

Each epic ships behind its flag; dogfood on staging 24h before flipping env to `true` in prod. Full rollback: revert merge; metrics harness stays (additive). Tool signatures preserved → frontend remains compatible during rollback.

## Open Questions

- [ ] Should `GOTCHAS` count include or exclude the version identifier and the tier-keyword preamble? Spec says "block" ≤ 800 tokens — interpret as content only.
- [ ] When GLB cache hit occurs but the in-memory `TopoDS_Shape` is already released, do we re-load from STEP? Default: yes, lazily; no extra flag.
- [ ] Dimensional regex for M-bolt diameters — confirm table is server-side (post-MVP if too large).
