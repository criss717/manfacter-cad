# Proposal: Face Picking & Speed Optimizations

## Intent

Users cannot target specific faces when requesting CAD edits — they must describe geometry imprecisely ("the top face"). Simultaneously, simple requests waste ~85% input tokens on a prompt designed for complex geometry, and mandatory post-generation inspection adds ~3-5s per successful run. This change closes the interaction gap (face picking) and reduces latency/waste (speed optimizations).

## Scope

### In Scope
- Three.js raycasting → hit point + normal → WebSocket `face_pick` message → OCP face matching → face selector expression → LLM command context
- Zustand store additions: `selectedFace`, `facePickerEnabled`
- Face highlight on hover/click in CadExplorer.tsx
- Backend: `find_ocp_face()` in generator.py, `pick_face_on_model` tool, `face_pick` WebSocket handler
- Minimal SIMPLE-tier prompt (~3K chars) with API cheatsheet only
- Remove per-chunk TEXT print in `_run_chat`; keep final text print
- Make `inspect_geometry` optional (call only on suspicious bbox or user request)

### Out of Scope
- Edge/vertex selection (lines too thin for reliable raycasting)
- Direct build123d code injection from face selection
- GPU picking / encoded render target
- MODERATE/COMPLEX prompt changes
- Removing or restructuring the GOTCHAS block

## Capabilities

### New Capabilities
- `face-picking`: Interactive face selection in 3D viewer via raycasting, OCP face matching, and LLM context injection

### Modified Capabilities
- `cad-tier-classification`: SIMPLE tier now receives a minimal prompt (~3K chars) instead of the full ~19K prompt; `inspect_geometry` relaxed from MUST to optional

## Approach

**Face picking** uses Position+Normal matching (explored approach #1): raycasting returns hit point + normal in world space → backend iterates OCP faces via `TopExp_Explorer` + `BRep_Tool.Triangulation` → closest face to hit point → returns selector expression (e.g. "the top face") → frontend highlights → user command includes face context.

**Speed**: Three independent optimizations: (a) replace unified prompt with minimal SIMPLE-tier prompt in `build_tier_directive`; (b) delete `print(f"[OPENAI] TEXT chunk: ...")` line; (c) change prompt requirement from "MUST call inspect_geometry" to "SHOULD call inspect_geometry only if bbox looks suspicious."

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/viewport/CadExplorer.tsx` | Modified | Add raycaster, click handler, face highlight mesh |
| `src/store/cadStore.ts` | Modified | Add `selectedFace`, `facePickerEnabled` state |
| `src/chat/useCadChat.ts` | Modified | Send `face_pick` WebSocket message on selection |
| `backend/cad_engine/generator.py` | Modified | Add `find_ocp_face()` with TopExp_Explorer matching |
| `backend/agent/tools.py` | Modified | Add `pick_face_on_model` tool definition |
| `backend/agent/server.py` | Modified | Handle `face_pick` WebSocket message |
| `backend/agent/openai_server.py` | Modified | Handle `face_pick` message; remove chunk print |
| `backend/agent/prompt.py` | Modified | Add minimal SIMPLE prompt; relax inspect_geometry to optional |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Face matching fails on symmetric/concave geometry | Med | Return multiple candidates with confidence scores; LLM uses `sort_by` selectors |
| SIMPLE prompt too minimal → LLM forgets basic API | Low | Include API cheatsheet + critical GOTCHAS; monitor first-attempt failure rate |
| Removing inspect_geometry hides regressions | Low | Auto-inspect (5-view Gemini) already validates; manual inspect still available |

## Rollback Plan

Face picking is gated behind `facePickerEnabled` toggle — disable to revert. SIMPLE prompt is a prompt-only change — revert `build_tier_directive` to restore full prompt. Chunk print removal and inspect relaxation are single-line changes with trivial revert.

## Dependencies

- Face picking exploration already completed (Approach 1 validated)
- Speed optimizations are independent of face picking
- Both can be developed in parallel

## Success Criteria

- [ ] Clicking a face in the viewer highlights it and sends a `face_pick` message
- [ ] Backend returns correct face selector for ≥ 90% of test cases
- [ ] User can issue commands like "make a hole here" with face context
- [ ] SIMPLE-tier prompt ≤ 3,500 chars; input tokens reduced by ≥ 80%
- [ ] Console no longer prints per-chunk TEXT lines
- [ ] `inspect_geometry` not called on successful SIMPLE generations