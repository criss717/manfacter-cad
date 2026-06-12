# Tasks: ForgeCAD Migration — Python/build123d → TypeScript/manifold-3d

## Review Workload Forecast

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

~2400 lines (21 new + 5 mod + 13 refs). 5 chained PRs:

| Unit | PR | Scope |
|------|-----|-------|
| 1 | PR 1 | src/cad/ — engine core |
| 2 | PR 2 | src/agent/ — WS, tools, prompts (↳ PR 1) |
| 3 | PR 3 | API routes + config (↳ PR 2) |
| 4 | PR 4 | Frontend adaptation (↳ PR 3) |
| 5 | PR 5 | Validation + backend delete |

## Phase 1: CAD Engine — `src/cad/`

- [ ] 1.1 `src/cad/types.ts` — Shape, BBox, CollisionResult, ParamDef, MeshCache
- [ ] 1.2 `src/cad/engine.ts` — Manifold.setup() lazy WASM, Shape wrapper, mesh cache
- [ ] 1.3 `src/cad/primitives.ts` — box, cylinder, sphere, torus (immutable)
- [ ] 1.4 `src/cad/booleans.ts` — union, subtract, intersect (immutable)
- [ ] 1.5 `src/cad/transforms.ts` — translate, rotate, scale, mirror (immutable)
- [ ] 1.6 `src/cad/inspect.ts` — getBoundingBox, getVolume, isEmpty, checkCollisions
- [ ] 1.7 `src/cad/export.ts` — toSTL, toGLB, toSTEP (lazy OCCT import)
- [ ] 1.8 `src/cad/snapshot.ts` — renderPNG via sharp, 4 canonical angles
- [ ] 1.9 `src/cad/params.ts` — Param.number, Param.bool, Param.select

## Phase 2: Agent — `src/agent/`

- [ ] 2.1 `src/agent/types.ts` — Message, ToolCall, Provider, Tier, SessionEntry
- [ ] 2.2 `src/agent/prompt.ts` — CAD_AGENT_PROMPT (Spanish), tier classify, GOTCHAS ≤800 tokens
- [ ] 2.3 `src/agent/session.ts` — Map store, TTL 60min, LRU GLB cache ≤20
- [ ] 2.4 `src/agent/dispatch.ts` — chat/completions, /messages, generateContent
- [ ] 2.5 `src/agent/tools.ts` — runCadCode, inspectCadModel, listOutputs, readReference; max 10 iters
- [ ] 2.6 `src/agent/image-analysis.ts` — Kimi GO + MiniMax M3 GO dual pipeline
- [ ] 2.7 `src/agent/server.ts` — next-ws handler, tool loop, stream events
- [ ] 2.8 Copy `backend/references/` → `references/` (13 files)

## Phase 3: API Routes & Config

- [ ] 3.1 `src/app/api/cad/ws.ts` — next-ws route → agent handler
- [ ] 3.2 `src/app/api/cad/output/[...path]/route.ts` — serve output files
- [ ] 3.3 `src/app/api/generate/route.ts` — REST POST fallback
- [ ] 3.4 `next.config.ts` — serverExternalPackages: manifold-3d, opencascade.js, sharp
- [ ] 3.5 `package.json` — add manifold-3d, opencascade.js, next-ws, sharp
- [ ] 3.6 `.env` — NEXT_PUBLIC_CAD_WS_URL, CAD_ENGINE, tier vars

## Phase 4: Frontend Adaptation

- [ ] 4.1 `src/chat/useCadChat.ts` — env var WS URL; snake→camel fields; single endpoint
- [ ] 4.2 `src/store/cadStore.ts` — adjust glbUrl/stlUrl paths for /api/cad/output/
- [ ] 4.3 `src/chat/ChatPanel.tsx` — remove client-side 3-server routing
- [ ] 4.4 `src/lib/cadGeneration.ts` — replace Python fetch with /api/generate
- [ ] 4.5 `src/app/api/chat/route.ts` — redirect REST callers to /api/generate

## Phase 5: Validation & Cleanup

- [ ] 5.1 Side-by-side: 10+ prompts, compare GLB/STL/STEP quality
- [ ] 5.2 Verify WS messages: ready, agent_event, done, error
- [ ] 5.3 Test tier classify: SIMPLE/MODERATE/COMPLEX
- [ ] 5.4 Test image analysis: upload → Kimi+MiniMax → CAD gen
- [ ] 5.5 Delete `backend/` (manual, after validation)
