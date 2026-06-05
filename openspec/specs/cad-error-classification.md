# cad-error-classification

Provides automated error classification and hint generation to guide the AI repair loop when build123d generation fails or produces manufacturability issues.

## Requirements

### Coverage preservation enforcement

The `classify_cad_error` function in `backend/agent/tools.py` SHALL retain all existing error categories. A metrics gate SHALL verify that classification coverage does not regress below the current taxonomy.

#### Scenario: All current categories preserved

**Given** the current `classify_cad_error` function covers 9 distinct error categories
**When** any code changes are made to `tools.py`, `prompt.py`, or `generator.py`
**Then** every existing error category SHALL still produce a non-empty hint string
**And** the function signature `classify_cad_error(error: str) -> str` SHALL remain unchanged

#### Scenario: Metrics enforcement of coverage

**Given** the metrics harness reads the last 200 agent runs
**When** the `scripts/metrics_check.py` script evaluates error classification coverage
**Then** the number of distinct error categories matched SHALL be ≥ the baseline count (9)
**And** the gate SHALL fail if any existing category no longer triggers a classification

---

### Material removal error patterns

The `classify_cad_error` function SHALL recognize error patterns related to material removal operations (overshoot cut cylinders, fillet-on-cut-edges, subtractive profile positioning).

#### Scenario: Cut tool does not fully intersect target

**Given** a boolean subtraction fails because the cutting tool does not intersect the target
**When** the error message contains "boolean" or "fuse" or "cut"
**Then** the hint SHALL mention that the cutting tool must overshoot the target completely
**And** the hint SHALL reference the material removal best practices from the GOTCHAS block

#### Scenario: Fillet applied on cut edges fails

**Given** a fillet operation fails on edges created by a boolean cut
**When** the error message matches both "fillet" and "boolean" patterns
**Then** the hint SHALL recommend applying fillets before boolean cuts when possible
**And** the hint SHALL suggest using `max_fillet()` to find the safe radius

---

### Manufacturing constraint error patterns

The `classify_cad_error` function SHALL recognize errors related to manufacturing constraints (minimum wall thickness, stock allowance violations).

#### Scenario: Wall thickness violation detected

**Given** a shell or hollow operation produces geometry with walls thinner than 1 mm
**When** a subsequent operation (fillet, chamfer, boolean) fails on that geometry
**Then** the hint SHALL suggest checking minimum wall thickness
**And** the classification SHALL include manufacturing-relevant guidance

#### Scenario: Zero or negative thickness

**Given** the error message indicates zero thickness in a subtractive or shell operation
**When** the error contains "thickness" or "shell" keywords
**Then** the hint SHALL report the dimensional issue and suggest a minimum value
**And** the classification SHALL be distinct from generic boolean errors

---

### GOTCHAS-driven classification augmentation

The error classification system SHALL incorporate the top build123d error patterns from the `GOTCHAS` block in `prompt.py` into its classification logic.

#### Scenario: GOTCHAS pattern matches error

**Given** the `GOTCHAS` block defines `material-removal` and `manufacturing` error patterns
**When** a `run_cad_code` call fails with an error matching a GOTCHAS pattern
**Then** `classify_cad_error` SHALL map the error to its corresponding GOTCHAS category
**And** the hint SHALL include a concise reference to the relevant GOTCHAS entry

#### Scenario: Classification count does not regress

**Given** the metrics gate runs on the last 200-run rolling window
**When** comparing error classification coverage before and after the change
**Then** the count of distinct classification categories SHALL be ≥ the pre-change baseline
**And** 2 consecutive failures SHALL be required before blocking the rollout
