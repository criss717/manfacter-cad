## Verification Report

**Change**: face-picking-and-speed
**Version**: spec v1
**Mode**: Standard

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 15 |
| Tasks complete | 15 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build (TypeScript)**: ✅ Passed
```text
npx tsc --noEmit → exit 0, no errors
```

**Build (Python syntax)**: ✅ Passed
```text
python3 -m py_compile → exit 0 for all 5 backend files:
  - generator.py OK
  - tools.py OK
  - server.py OK
  - openai_server.py OK
  - prompt.py OK
```

**Tests**: ⚠️ No automated test suite configured (neither vitest/jest nor pytest)
All verification relies on static analysis and source inspection. Runtime scenarios are unproven by automated tests.

### Spec Compliance Matrix

#### face-picking spec

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| R1 Face Picker Toggle | Toggle ON | CadExplorer.tsx — button toggles `facePickerEnabled`, shows emerald active state | ✅ COMPLIANT |
| R1 Face Picker Toggle | Toggle OFF clears highlight | CadExplorer.tsx — useEffect clears emissive on `facePickerEnabled` false | ✅ COMPLIANT |
| R2 Face Selection via Click | Face clicked sends pick | CadExplorer.tsx — raycaster onClick sends WS `face_pick` with position+normal+scale+modelId | ✅ COMPLIANT |
| R3 Empty Space Click | Empty space ignored | CadExplorer.tsx — `if (intersects.length === 0) return;` — no WS, no toast | ✅ COMPLIANT |
| R4 OCP Face Matching | Single face matched | generator.py `find_ocp_face()` — `TopExp_Explorer` iteration, weighted score 70/30, returns best match | ✅ COMPLIANT |
| R4 OCP Face Matching | Ambiguous match returns candidates | generator.py L732-758 — confidence < 0.5 or multiple faces within 10% → top-3 `matches` array with scores + `ambiguous` flag | ✅ COMPLIANT |
| R5 Face Highlight | Face highlighted on match | CadExplorer.tsx — emissive color set to 0x44ff44 on clicked mesh | ✅ COMPLIANT |
| R5 Face Highlight | Highlight cleared on toggle OFF | CadExplorer.tsx — emissive restored to original when `facePickerEnabled` turns false | ✅ COMPLIANT |
| R6 Face Context in Commands | Face referenced in user command | prompt.py `_PROMPT_FOOTER` includes face selector instructions; tool `pick_face_on_model` registered in both servers | ✅ COMPLIANT |

#### cad-tier-classification delta spec

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| SIMPLE failure escalates to MODERATE | SIMPLE failure triggers escalation | tools.py — `if tier == "SIMPLE": _current_tier.set("MODERATE")` | ✅ COMPLIANT |
| SIMPLE failure escalates to MODERATE | MODERATE does not escalate further | tools.py — escalation only from SIMPLE | ✅ COMPLIANT |
| Optional inspect_geometry | inspect_geometry skipped on success | prompt.py — "you MAY call inspect_geometry" — optional directive | ✅ COMPLIANT |
| Optional inspect_geometry | inspect_geometry called on suspicious result | prompt.py — "Only call if auto-inspect flags suspicious" | ✅ COMPLIANT |
| Tier-driven behavior | Tier controls prompt assembly size | server.py — `SIMPLE_CAD_PROMPT` (~2.4K) vs `CAD_AGENT_PROMPT` (~19K) | ✅ COMPLIANT |
| Tier-driven behavior | Tier controls reference loading | prompt.py `build_tier_directive` — SIMPLE: "NO references needed"; COMPLEX: "EMBEDDED" | ✅ COMPLIANT |
| Tier-driven behavior | Tier controls mesh deflection | generator.py `_TIER_DEFLECTION` — SIMPLE 0.1/0.8, MODERATE 0.05/0.5, COMPLEX 0.02/0.3 | ✅ COMPLIANT |
| Tier-driven behavior | Tier controls snapshot mandate | prompt.py — SIMPLE: "Snapshot: not required"; COMPLEX: "MANDATORY_SNAPSHOT" | ✅ COMPLIANT |

**Compliance summary**: 17/17 scenarios compliant

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Face Picker Toggle (R1) | ✅ Implemented | Toggle button + Zustand state + visual active indicator |
| Face Selection via Click (R2) | ✅ Implemented | Raycaster + WebSocket `face_pick` message with modelId |
| Empty Space Click (R3) | ✅ Implemented | Early return on no intersection |
| OCP Face Matching (R4) | ✅ Implemented | Single match + ambiguous top-3 candidates with scores |
| Face Highlight (R5) | ✅ Implemented | Emissive color on mesh click; clears on toggle OFF |
| Face Context in Commands (R6) | ✅ Implemented | Prompt footer + registered tool for LLM use |
| SIMPLE→MODERATE escalation | ✅ Implemented | Via `_current_tier` contextvar in tools.py |
| Optional inspect_geometry | ✅ Implemented | Directive relaxed from MUST to MAY/SHOULD |
| SIMPLE prompt ~3K chars | ✅ Implemented | 2357 chars actual content (fits ~3K budget) |
| Remove chunk prints | ✅ Implemented | No per-chunk print statements in openai_server.py |
| Tier-driven deflection | ✅ Implemented | `_TIER_DEFLECTION` + `deflection_for_tier()` |
| WS message TS interfaces | ✅ Implemented | `FacePickMessage` + `FacePickResultMessage` in useCadChat.ts |
| modelId in face_pick message | ✅ Implemented | `FacePickMessage.modelId` sent and read by both servers |
| currentModelId in Zustand | ✅ Implemented | State field + setter in cadStore.ts, set on run_cad_code success |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1: Zustand for face state | ✅ Yes | `facePickerEnabled`, `selectedFace`, `currentModelId` in cadStore |
| D2: WebSocket send via direct wsRef | ✅ Yes | `sendFacePick` uses `ensureConnection()` + direct `ws.send()` |
| D3: Face highlight via emissive | ✅ Yes | `mat.emissive = new THREE.Color(0x44ff44)` |
| D4: OCP matching 70%/30% | ✅ Yes | `score = 0.7 * norm_dist + 0.3 * (1.0 - abs(normal_dot))` |
| D5: SIMPLE_CAD_PROMPT constant | ✅ Yes | Separate constant, assemble_prompt dispatches |
| D6: Tier escalation on SIMPLE failure | ✅ Yes | `_current_tier.set("MODERATE")` on failure |
| D7: Ambiguous candidates with scores | ✅ Yes | Top-3 `matches` array + `ambiguous` flag in response |
| Contract: `modelId` in face_pick WS | ✅ Yes | `FacePickMessage.modelId` sent; `server.py`/`openai_server.py` read `modelId` |

### Issues Found

**CRITICAL**: None

**WARNING**: None — all 6 previous warnings resolved:
- W1: Ambiguous face candidates now return top-3 with scores (generator.py L732-758)
- W2: tasks.md updated with `[x]` marks for all 15 tasks
- W3: TS interfaces `FacePickMessage` and `FacePickResultMessage` added (useCadChat.ts L9-28)
- W4: `modelId` included in `FacePickMessage` and sent in `sendFacePick` (useCadChat.ts L14, L163)
- W5: `sendFacePick` uses direct `ws.send()` via `ensureConnection()` (useCadChat.ts L154-169)
- W6: `currentModelId` stored in Zustand state with setter (cadStore.ts L61, L119, L159)

**SUGGESTION**: None

### Verdict
**PASS**

All 15 implementation tasks complete, all 17 spec scenarios compliant, all 6 previous warnings resolved. TypeScript and Python compilations pass with zero errors. Design coherence is complete — all design decisions followed.
