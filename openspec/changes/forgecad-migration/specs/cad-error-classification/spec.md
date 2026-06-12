# Delta for cad-error-classification

## MODIFIED Requirements

### Inspection finding classification

The `classifyCadIssue` function SHALL classify inspection findings from manifold-3d and opencascade.js operations into a taxonomy of 5-7 categories that evolve organically from real failures. Categories SHALL cover mesh quality, boolean precision, and export issues.
(Previously: 9 build123d-specific error categories in `classify_cad_error`)

#### Scenario: All current categories produce hints

- GIVEN the `classifyCadIssue` function covers at least 5 categories
- WHEN any code changes are made to the agent module
- THEN every existing category SHALL still produce a non-empty hint string

#### Scenario: New category added from production data

- GIVEN a novel manifold-3d failure pattern appears in production
- WHEN the pattern recurs at least 3 times in a 200-run window
- THEN a new category SHALL be added to `classifyCadIssue`
- AND the taxonomy SHALL grow organically without a fixed 1:1 mapping to old build123d categories

### Mesh quality findings

The `classifyCadIssue` function SHALL recognize manifold-3d mesh quality issues: non-manifold edges, degenerate triangles, and boolean precision artifacts.

#### Scenario: Non-manifold mesh detected

- GIVEN a boolean operation produces a mesh with non-manifold edges
- WHEN the inspection detects mesh topology issues
- THEN `classifyCadIssue` SHALL return hint: "Mesh is non-manifold. Check for coplanar faces or zero-thickness features."

#### Scenario: Degenerate triangles detected

- GIVEN a shape contains triangles with near-zero area
- WHEN the inspection identifies degenerate faces
- THEN the hint SHALL suggest simplifying the geometry or adjusting boolean operands

#### Scenario: Boolean precision issue

- GIVEN a subtract operation produces artifacts near coplanar faces
- WHEN the mesh shows visible defects at the cut boundary
- THEN the hint SHALL recommend overshooting cutting tools by ≥ 1mm to avoid coplanar face ambiguity

### Export findings

The `classifyCadIssue` function SHALL recognize opencascade.js export issues: non-watertight mesh for STEP, B-rep construction failures, and WASM initialization errors.

#### Scenario: Non-watertight STEP export

- GIVEN a mesh with holes or boundary edges
- WHEN toSTEP() is called via opencascade.js
- THEN if export fails due to non-watertight mesh, hint SHALL suggest ensuring the shape is a closed solid

#### Scenario: B-rep construction failure

- GIVEN manifold-3d mesh is passed to opencascade.js for B-rep conversion
- WHEN the conversion fails
- THEN `classifyCadIssue` SHALL return hint about mesh-to-B-rep fidelity loss at sharp edges

#### Scenario: WASM cold-start timeout

- GIVEN opencascade.js WASM has not been loaded
- WHEN the first toSTEP() call exceeds 5-second timeout
- THEN `classifyCadIssue` SHALL report the cold-start latency and suggest retry

### GOTCHAS-driven classification linkage

The inspection finding classification SHALL incorporate manifold-3d and opencascade.js error patterns from the GOTCHAS block in the agent prompt.

#### Scenario: GOTCHAS pattern matches inspection finding

- GIVEN the GOTCHAS block defines manifold-3d boolean and coplanar-face patterns
- WHEN a `runCadCode` result triggers inspection and an issue matches a GOTCHAS pattern
- THEN `classifyCadIssue` SHALL map the finding to its corresponding GOTCHAS category
- AND the hint SHALL include a reference to the relevant GOTCHAS entry

#### Scenario: Classification count does not regress below baseline

- GIVEN the metrics gate runs on the last 200-run rolling window
- WHEN comparing inspection finding classification coverage
- THEN the count of distinct categories SHALL be ≥ 5 (manifold-3d baseline)
- AND 2 consecutive failures SHALL be required before blocking rollout

## REMOVED Requirements

### Coverage preservation enforcement (build123d baseline)

(Reason: The 9-category build123d taxonomy is replaced by a 5-7 category manifold-3d/OCCT taxonomy. A fixed 9-category baseline is no longer meaningful.)
(Migration: Baseline is now ≥ 5 categories for manifold-3d. Categories evolve organically from real failures rather than being ported 1:1.)

### Material removal error patterns (build123d-specific)

(Reason: Boolean subtraction patterns in manifold-3d differ from OCP. Manifold handles coplanar faces differently; overshoot guidance is part of the boolean precision category.)
(Migration: Boolean best practices are encoded in the GOTCHAS block and mesh quality findings category.)

### Manufacturing constraint error patterns (build123d-specific)

(Reason: Wall thickness and stock allowance are hard-coded in build123d hints. In manifold-3d, these become mesh inspection findings (degenerate triangles for zero-thickness) rather than error codes.)
(Migration: Manufacturing constraints are validated via inspectCadModel (volume, surface area, dimensional check) rather than error classification.)
