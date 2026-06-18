# Tasks: Face Picking & Speed Optimizations

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 235-300 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: State & Infrastructure

- [x] 1.1 Add `facePickerEnabled: boolean`, `selectedFace: {faceIndex, description, selector, confidence} | null` state + setters to `src/store/cadStore.ts`
- [x] 1.2 Define `face_pick` and `face_pick_result` WebSocket message TypeScript interfaces in `src/chat/useCadChat.ts`

## Phase 2: Backend — Face Picking

- [x] 2.1 Add `find_ocp_face(position, normal, scale, model_id)` to `backend/cad_engine/generator.py` — iterate `TopExp_Explorer` faces, match by `BRep_Tool.Triangulation` weighted distance (pos 70% + normal 30%)
- [x] 2.2 Add `pick_face_on_model()` tool to `backend/agent/tools.py` — call `find_ocp_face`, return `{faceIndex, description, selector, confidence}`; register in TOOLS + TOOL_MAP
- [x] 2.3 Route `face_pick` WS message to `pick_face_on_model` in `backend/agent/server.py` and `backend/agent/openai_server.py`; send `face_pick_result` response

## Phase 3: Frontend — Face Picking

- [x] 3.1 Add raycasting onClick handler to `src/viewport/CadExplorer.tsx` — on click with face picker ON, intersect scene, send WS `face_pick` with position+normal+scale; ignore empty-space clicks
- [x] 3.2 Add `face_pick_result` WS handler in `src/chat/useCadChat.ts` — update `cadStore` with matched face + highlight via emissive material clone on faceIndex
- [x] 3.3 Add `FacePickerToggle` button component in `src/viewport/CadExplorer.tsx` — toggle ON/OFF, clear highlight+state on deactivation

## Phase 4: Backend — Speed Optimizations

- [x] 4.1 Add `SIMPLE_CAD_PROMPT` constant (~3K chars: API cheatsheet, GOTCHAS v2, Spanish response rule, 13-attempt limit) to `backend/agent/prompt.py`
- [x] 4.2 Update `assemble_prompt()` in `backend/agent/prompt.py` — route SIMPLE tier to `SIMPLE_CAD_PROMPT`; add tier escalation on SIMPLE failure (set `_current_tier` to MODERATE)
- [x] 4.3 Make `inspect_geometry` optional in `backend/agent/prompt.py` — remove mandatory directive; keep only for suspicious bbox
- [x] 4.4 Remove per-chunk `print("[OPENAI] TEXT chunk:...")` in `backend/agent/openai_server.py` `_run_chat` loop

## Phase 5: Integration & Verification

- [x] 5.1 Store `currentModelId` in Zustand on `run_cad_code` success (maps GLB → backend shape handle for face_pick)
- [x] 5.2 Update system prompt in `backend/agent/prompt.py` so LLM uses `pick_face_on_model` for targeted edits when user clicks face
- [x] 5.3 Manual integration test: face pick flow (toggle → click face → get highlight → "make a hole here" yields targeted code)
- [x] 5.4 Manual test: SIMPLE tier generates simple cube with ~3K prompt, < 5s; no per-chunk console prints; inspect_geometry not called on success
