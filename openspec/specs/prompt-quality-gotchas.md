# prompt-quality-gotchas

A versioned GOTCHAS block appended to the agent system prompt that encodes top build123d error patterns, material-removal best practices, and manufacturing constraints to reduce first-attempt failures.

## Requirements

### GOTCHAS block in system prompt

The agent system prompt SHALL include a versioned `GOTCHAS` block appended after the main instruction text in `backend/agent/prompt.py`. The block SHALL NOT exceed 800 tokens.

#### Scenario: GOTCHAS block present in assembled prompt

**Given** the `CAD_AGENT_PROMPT` constant is defined in `backend/agent/prompt.py`
**When** the agent is initialized with the prompt
**Then** the prompt SHALL contain a `## GOTCHAS` section
**And** the section SHALL be positioned after the main workflow instructions and before the RESPONSE RULES

#### Scenario: GOTCHAS block under token budget

**Given** the GOTCHAS block content
**When** the block is tokenized with the Gemini tokenizer
**Then** the resulting token count SHALL be ≤ 800
**And** if the block approaches 800 tokens, lower-priority patterns SHALL be moved to `read_reference` docs

#### Scenario: GOTCHAS version identifier

**Given** the GOTCHAS block is modified
**When** a new error pattern or best practice is added
**Then** the block version identifier SHALL be incremented
**And** the version SHALL be logged in agent metadata for debugging

### Material removal best practices

The GOTCHAS block SHALL include material removal guidelines covering overshoot cut cylinders and fillet-on-cut-edges.

#### Scenario: Overshoot cut cylinders guideline

**Given** the agent generates code for a subtractive boolean operation
**When** the GOTCHAS block is present in the prompt
**Then** the agent SHALL be instructed to extend cutting cylinders beyond the target body (e.g., `Cylinder(r, depth + 1.0)`) for through-cuts
**And** the guidance SHALL state: "For subtractive cuts, the cutting tool MUST overshoot the target completely"

#### Scenario: Fillet cut edges guideline

**Given** the agent generates code that applies fillets after boolean cuts
**When** the GOTCHAS block is present in the prompt
**Then** the agent SHALL be instructed to apply fillets BEFORE holes and cuts when possible
**And** the guidance SHALL state: "Apply fillets BEFORE subtracting holes. After cuts, use max_fillet() to find the safe radius"

### Manufacturing constraints

The GOTCHAS block SHALL include manufacturing constraints covering minimum wall thickness and stock allowance.

#### Scenario: Minimum wall thickness guideline

**Given** the agent generates code for a hollow or shelled part
**When** the GOTCHAS block is present in the prompt
**Then** the agent SHALL be instructed to maintain at least 1.0 mm wall thickness for FDM-printable parts
**And** the guidance SHALL state: "MIN WALL: shell/hollow operations MUST leave ≥ 1.0 mm wall thickness"

#### Scenario: Stock allowance guideline

**Given** the agent generates code for a part that interfaces with another component
**When** the GOTCHAS block is present in the prompt
**Then** the agent SHALL be instructed to add 0.2 mm clearance to mating features
**And** the guidance SHALL state: "CLEARANCE: mating faces and hole diameters need 0.2 mm clearance for 3D-printed parts"

### Top build123d error patterns

The GOTCHAS block SHALL encode the most frequent build123d API errors encountered in production, including Plane enum restrictions, edges()/faces() as methods, and fillet signature correctness.

#### Scenario: Plane enum gotcha

**Given** the GOTCHAS block is present in the prompt
**When** the agent generates code using Plane references
**Then** the block SHALL remind that `Plane.XN, Plane.XP, Plane.YN, Plane.YP, Plane.ZN, Plane.ZP` do not exist
**And** only `Plane.XY, Plane.YZ, Plane.XZ` SHALL be listed as valid

#### Scenario: edges/faces as methods gotcha

**Given** the GOTCHAS block is present in the prompt
**When** the agent generates code selecting edges or faces
**Then** the block SHALL remind that `edges()` and `faces()` are methods requiring parentheses
**And** the pattern `shape.edges` (without parentheses) SHALL be flagged as incorrect

#### Scenario: Fillet signature gotcha

**Given** the GOTCHAS block is present in the prompt
**When** the agent generates code with fillet operations
**Then** the block SHALL specify the correct signature: `shape.fillet(radius, [edge_list])`
**And** the difference between shape method fillet and global `fillet()` SHALL be explained

### GOTCHAS-driven error classification linkage

The GOTCHAS patterns SHALL be linked to the `classify_cad_error` function so that runtime errors map back to the GOTCHAS category that should have prevented them.

#### Scenario: Error-to-GOTCHAS mapping

**Given** a `run_cad_code` call fails with "AttributeError: Plane.XN"
**When** `classify_cad_error` processes the error
**Then** the hint output SHALL reference the Plane gotcha from the GOTCHAS block
**And** the classification SHALL be consistent with the GOTCHAS category

#### Scenario: GOTCHAS coverage tracked in metrics

**Given** the metrics harness evaluates the last 200 runs
**When** calculating error classification coverage
**Then** the harness SHALL track how many errors match a GOTCHAS category
**And** the coverage rate SHALL be reported alongside other metrics
