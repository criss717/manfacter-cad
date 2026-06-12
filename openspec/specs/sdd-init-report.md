# SDD Init Report — ManfacterCAD

**Date:** 2026-06-08
**Mode:** OpenSpec
**Status:** Complete

---

## Executive Summary

ManfacterCAD is a production-grade AI-powered 3D CAD generation application with a Next.js frontend and Python/FastAPI backend. The project already has an established OpenSpec artifact store with 8 spec files, feature flags, design system tokens, and SDD-based commit workflow. Testing infrastructure is entirely absent — no test runner, no test files, no coverage tooling exists on either side of the stack.

## Detected Stack

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| UI Library | React 19.2 |
| Language | TypeScript 5 (strict mode) |
| Styling | Tailwind CSS 4 + PostCSS |
| State | Zustand 5 |
| 3D | Three.js 0.175 + @react-three/fiber 9 + @react-three/drei 10 |
| Animation | Framer Motion 12 |
| Auth | next-auth 5.0.0-beta.30 |
| Validation | Zod 4 |
| Utilities | CVA 0.7, CLSX 2, tailwind-merge 3 |
| AI SDK | ai-sdk/google + ai-sdk/openai + ai 4 |
| Database | Drizzle ORM + drizzle-kit + @vercel/postgres |
| Package | pnpm (workspace) |

### Backend
| Layer | Technology |
|-------|-----------|
| Framework | FastAPI + Uvicorn |
| Language | Python 3.11+ |
| CAD Engine | build123d + OpenCASCADE |
| Agents | Google ADK (Gemini 3.5 Flash), OpenAI, Anthropic |
| Compute | numpy, trimesh, Pillow |
| Real-time | WebSockets |

## Conventions Found

| Convention | Detail |
|------------|--------|
| **Language** | Spanish-first UI (`lang="es"`), Spanish commit messages, Spanish backend comments |
| **Design System** | Apple-inspired (DESIGN.md): color tokens, typography scale, spacing, surface elevation, zero box-shadows |
| **Commit Style** | Spanish conventional commits: `feat:`, `fix:`, `sdd:`, `Merge pull request` |
| **Type Safety** | TypeScript strict mode, Python type hints throughout |
| **Code Style** | ESLint (next/core-web-vitals + typescript), no formatter configured |
| **Path Aliases** | `@/*` → `./src/*` (TypeScript paths) |
| **Feature Flags** | `EPIC_A_ENABLED`, `EPIC_B_ENABLED`, `EPIC_C_ENABLED` environment variables |
| **Error Handling** | CAD tier classification (SIMPLE/MODERATE/COMPLEX), repair loop (13 retries), reusable error classification |
| **Architecture** | Screaming architecture in frontend (by domain concern), clean-ish separation in backend (agent/cad_engine/main) |

## Architecture Patterns

### Frontend Patterns
- **Server/Client split**: `page.tsx` — mostly `"use client"` for interactive pages, App Router for structure
- **Zustand stores**: Centralized state in `cadStore.ts`, `settingsStore.ts`, `autoSave.ts`
- **Component-per-domain**: `chat/`, `viewport/`, `export/`, `components/` directories
- **Route groups**: `(app)/`, `(auth)/` with parallel/catch-all routes
- **API Routes**: `src/app/api/chat/` for Next.js API, separate FastAPI backend on `/api/generate`

### Backend Patterns
- **Service-oriented**: `main.py` orchestrates, `cad_engine/` generates geometry, `agent/` manages AI interaction
- **ADK Agent pattern**: Agent + tools + prompt separation in `agent/agent.py`, `agent/tools.py`, `agent/prompt.py`
- **Mesh caching**: `MeshCache` frozen dataclass for shared triangulation, `GLBSessionCache` for binary output
- **Feature gates**: Conditional logic via `EPIC_*_ENABLED` flags in `agent/feature_flags.py`
- **Session persistence**: WebSocket-based sessions, shape registry in memory, code-by-model-id maps
- **Inspection pipeline**: `inspect.py` → `classify_cad_error` → retry/repair loop

## Testing Capability

### Current State: NONE

| Capability | Status |
|------------|--------|
| Test runner (JS/TS) | ❌ Not configured |
| Test runner (Python) | ❌ Not configured |
| Test files | ❌ None found |
| Coverage tooling | ❌ None |
| E2E framework | ❌ None |
| Linter | ✅ ESLint (`pnpm lint`) |
| Type checker | ✅ `npx tsc --noEmit` |
| Formatter | ❌ None |
| CI/CD tests | ❌ Not detected |

### Root Causes
1. No Jest/Vitest config files or dependencies
2. No Playwright/Cypress configuration
3. No pytest.ini/setup.cfg or conftest.py for Python
4. `pnpm test` or `npm test` not defined in package.json
5. `.gitignore` has `/coverage` (anticipating future coverage) but no coverage tooling installed

## TDD Support

**Strict TDD: `false`** (explicit in openspec/config.yaml)

Rationale: With zero testing infrastructure, strict TDD is impossible. The project has mature production code (~3k+ LOC frontend, ~1.5k+ LOC backend) without any test coverage.

## Artifacts Created

| Artifact | Path | Status |
|----------|------|--------|
| Config update | `openspec/config.yaml` | ✅ Updated context with detailed stack |
| Init report | `openspec/specs/sdd-init-report.md` | ✅ Created |
| Skill registry | `.atl/skill-registry.md` | ✅ Already exists (14 skills indexed) |

## Existing OpenSpec Specs (8 files)

| Spec | Path |
|------|------|
| CAD Error Classification | `openspec/specs/cad-error-classification.md` |
| CAD Repair Loop | `openspec/specs/cad-repair-loop.md` |
| CAD Tier Classification | `openspec/specs/cad-tier-classification.md` |
| Dimensional Validation | `openspec/specs/dimensional-validation.md` |
| Engine Mesh Reuse | `openspec/specs/engine-mesh-reuse.md` |
| GLB Session Cache | `openspec/specs/glb-session-cache.md` |
| Prompt Quality Gotchas | `openspec/specs/prompt-quality-gotchas.md` |

## Next Recommended Steps

1. **`/sdd-explore`** — Explore introducing a test runner strategy (Vitest for TS, pytest for Python)
2. **`/sdd-new`** — Start a new change adding testing infrastructure incrementally
3. Consider vitest + @testing-library/react for frontend unit tests
4. Consider pytest for backend tests given FastAPI test client support
5. Consider lint-staged + husky for pre-commit quality gates
6. Add a formatter (Prettier or Biome) to complement eslint

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No tests on 4k+ LOC production codebase | 🔴 HIGH | Add testing incrementally starting with critical CAD engine logic |
| No formatter → style inconsistency | 🟡 MEDIUM | Adopt Prettier or Biome |
| Design system in DESIGN.md may drift from implementation | 🟡 MEDIUM | Add token audit specs to OpenSpec |
| Python backend lacks linting/type checking | 🟡 MEDIUM | Add ruff + mypy to backend |
| No CI/CD detected | 🟡 MEDIUM | Set up GitHub Actions with quality gates |
