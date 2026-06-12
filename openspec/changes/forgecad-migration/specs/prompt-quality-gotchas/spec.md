# Delta for prompt-quality-gotchas

## MODIFIED Requirements

### GOTCHAS block in system prompt

The agent system prompt SHALL include a versioned `GOTCHAS` block appended after the main instruction text. The block SHALL NOT exceed 800 tokens and SHALL contain manifold-3d JavaScript patterns, opencascade.js gotchas, and the Param pattern for tunable dimensions.
(Previously: build123d Python patterns — Plane enum, edges()/faces() methods, fillet signatures)

#### Scenario: GOTCHAS block present in assembled prompt

- GIVEN the CAD agent prompt is assembled for TypeScript agent
- WHEN the agent is initialized
- THEN the prompt SHALL contain a `## GOTCHAS` section
- AND the section SHALL be positioned after the main workflow instructions

#### Scenario: GOTCHAS block under token budget

- GIVEN the GOTCHAS block content
- WHEN tokenized
- THEN the resulting token count SHALL be ≤ 800
- AND overflow patterns SHALL be moved to `readReference` docs

#### Scenario: GOTCHAS version identifier

- GIVEN the GOTCHAS block is modified
- WHEN a new manifold-3d or opencascade.js pattern is added
- THEN the block version identifier SHALL be incremented
- AND the version SHALL be logged in agent metadata

### manifold-3d gotchas

The GOTCHAS block SHALL include manifold-3d-specific patterns: WASM initialization must precede all operations, boolean precision near coplanar faces, and unit consistency (mm default).

#### Scenario: WASM init gotcha

- GIVEN the GOTCHAS block is present in the prompt
- WHEN the agent generates manifold-3d code
- THEN the block SHALL remind that `await Manifold.setup()` MUST be called before any shape construction
- AND the guidance SHALL state: "WASM INIT: await Manifold.setup() before ANY manifold-3d call. This is async — never call it synchronously."

#### Scenario: Coplanar face boolean gotcha

- GIVEN the GOTCHAS block is present in the prompt
- WHEN the agent generates subtract or union code
- THEN the block SHALL warn that coplanar faces cause precision issues in booleans
- AND the guidance SHALL state: "COPLANAR: cutting tools MUST overshoot target by ≥ 1mm. Coplanar faces at boolean boundaries produce artifacts."

#### Scenario: Unit scale gotcha

- GIVEN the GOTCHAS block is present in the prompt
- WHEN the agent generates code with dimensions
- THEN the block SHALL remind that manifold-3d uses mm by default
- AND the guidance SHALL state: "UNITS: all dimensions in mm. No unit conversion needed. Input = output."

### opencascade.js gotchas

The GOTCHAS block SHALL include opencascade.js patterns: cold-start latency of 2-5s for WASM load, B-rep conversion from mesh may lose fidelity at sharp edges, and toSTEP requires watertight input.

#### Scenario: Cold-start latency gotcha

- GIVEN the GOTCHAS block is present
- WHEN the agent generates code using toSTEP
- THEN the block SHALL warn that the first OCCT WASM call takes 2-5 seconds
- AND guidance SHALL state: "OCCT COLD START: first toSTEP() call takes 2-5s for WASM init. Subsequent calls are fast."

#### Scenario: Mesh-to-B-rep fidelity gotcha

- GIVEN the GOTCHAS block is present
- WHEN toSTEP is used on a manifold mesh
- THEN the guidance SHALL note that B-rep conversion may lose fidelity at sharp edges
- AND SHALL state: "FIDELITY: manifold mesh → B-rep → STEP may lose edge sharpness. Use fine refinement for production exports."

### Param pattern

The GOTCHAS block SHALL include the Param pattern for defining tunable dimensions that the frontend property panel can read and let users tweak.

#### Scenario: Param.number usage

- GIVEN the GOTCHAS block is present
- WHEN the agent generates code with dimensions
- THEN the guidance SHALL instruct using `Param.number('name', defaultValue, {min, max, step})` for key dimensions
- AND SHALL state: "PARAM: use Param.number() for dimensions the user might tweak. Param.bool() for toggles. The frontend reads these to build the property panel."

#### Scenario: Inspection-first mindset

- GIVEN the GOTCHAS block is present
- WHEN the agent generates CAD code
- THEN the guidance SHALL instruct: "INSPECT FIRST: after every runCadCode, inspectCadModel runs automatically. Never assume success — the inspection results tell you what to fix."

### Material removal and manufacturing constraints

The GOTCHAS block SHALL include updated manufacturing constraints adapted for manifold-3d: overshoot cutting tools, minimum wall thickness, and clearance for 3D-printed parts.

#### Scenario: Overshoot cutting tools guideline

- GIVEN the agent generates subtract code
- WHEN the GOTCHAS block is present
- THEN the agent SHALL be instructed: "For subtract(), cutting tools MUST overshoot target by ≥ 1mm. Coplanar faces cause boolean artifacts."

#### Scenario: Minimum wall thickness

- GIVEN the agent generates hollow or shelled parts
- WHEN the GOTCHAS block is present
- THEN the guidance SHALL state: "MIN WALL: hollow operations MUST leave ≥ 1.0mm wall for FDM printing."

#### Scenario: Clearance for mating parts

- GIVEN the agent generates interfacing parts
- WHEN the GOTCHAS block is present
- THEN the guidance SHALL state: "CLEARANCE: mating faces need 0.2mm gap. Hole diameters for bolts: bolt_diameter + 0.2mm."

## REMOVED Requirements

### Top build123d error patterns

(Reason: The Plane enum, edges()/faces() method calls, and fillet signature gotchas are build123d Python API-specific. They have no manifold-3d equivalent.)
(Migration: Replaced by manifold-3d gotchas: WASM init order, coplanar face precision, unit scaling, and Param pattern.)

### GOTCHAS-driven error classification linkage (build123d-specific)

(Reason: The error-to-GOTCHAS mapping relied on build123d Python error patterns (AttributeError, OCP exceptions). The new linkage maps inspection findings to manifold-3d GOTCHAS categories.)
(Migration: `classifyCadIssue` now maps inspection findings (non-manifold mesh, degenerate triangles, boolean artifacts) to manifold-3d GOTCHAS entries. The concept of GOTCHAS-classification linkage is preserved.)
