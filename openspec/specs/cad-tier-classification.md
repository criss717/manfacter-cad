# cad-tier-classification

Classifies CAD generation requests into SIMPLE, MODERATE, or COMPLEX tiers before code generation. The tier drives reference loading, mesh deflection, snapshot requirements, and other downstream behavior.

## Requirements

### Tier classification from keyword heuristics

The system SHALL classify every user request into one of three tiers (SIMPLE, MODERATE, COMPLEX) using keyword heuristics applied to the user message before the first `run_cad_code` call.

#### Scenario: SIMPLE part recognized

**Given** a user requests a "box of 100x60x20 mm" or a "cylinder with 4 holes"
**When** the request matches SIMPLE keywords (Box, Cylinder, Sphere, hole patterns on flat faces, chamfer, fillet, L-bracket, spacer, washer, plate, shaft)
**And** the estimated code length is under 50 lines
**Then** the tier SHALL be classified as SIMPLE
**And** `read_reference` SHALL NOT be required before code generation
**And** coarse mesh deflection SHALL be used for export

#### Scenario: MODERATE part recognized

**Given** a user requests a "bracket with ribs and a cutout" or a "flanged pipe with bolt pattern"
**When** the request has more than 5 features but fewer than 12
**And** the feature count falls between SIMPLE and COMPLEX thresholds
**And** the request does not reference gears, sweeps, lofts, assemblies > 2 parts, or BuildPart/BuildLine
**Then** the tier SHALL be classified as MODERATE
**And** `read_reference` SHALL NOT be required before code generation
**And** default mesh deflection SHALL be used for export

#### Scenario: COMPLEX part recognized

**Given** a user requests a "helical gear with 24 teeth" or a "turbine blade with aerodynamic profile"
**When** the request matches COMPLEX keywords (gear with teeth, helical, sweep, loft, revolve, cam, spline, shell/hollow, text embossing, assemblies > 2 parts, BuildPart/BuildSketch/BuildLine)
**Or** the estimated code length exceeds 60 lines
**Or** the request contains "assembly"/"boolean"/"fillet" tokens with high feature count
**Then** the tier SHALL be classified as COMPLEX
**And** `read_reference("build123d-modeling.md")` SHALL be required before code generation
**And** fine mesh deflection SHALL be used for export
**And** `make_snapshot` SHALL be mandatory after generation

### Default to MODERATE on ambiguity

When classification heuristics produce conflicting signals, the system SHALL default to MODERATE and SHALL log the ambiguous classification for review.

#### Scenario: Ambiguous feature count

**Given** a user request contains both SIMPLE and COMPLEX keywords
**And** the estimated code length is between 50 and 60 lines
**When** the tier classifier evaluates the request
**Then** the tier SHALL default to MODERATE
**And** the ambiguity SHALL be logged with the request text and resolved tier

#### Scenario: Missing dimension keyword present

**Given** a user request contains "estándar", "normal", or "típico" but no numeric dimensions
**When** the classifier evaluates the request
**Then** the tier SHALL be determined by feature keywords only
**And** the missing-dimension policy from the prompt SHALL apply independently of tier

### Tier-driven behavior selection

The classified tier SHALL drive prompt assembly size, reference loading policy, mesh deflection, and snapshot requirement.

(Previously: uniform ~19K prompt for all tiers. Now SIMPLE gets a minimal ~3K prompt.)

#### Scenario: Tier controls prompt assembly size

- GIVEN a tier has been classified
- WHEN the prompt is assembled for the agent
- THEN prompt size SHALL be tier-dependent:
- AND SIMPLE: minimal prompt (~3K chars) — API cheatsheet + basic rules only
- AND MODERATE: full prompt with API cheatsheet and embedded reference
- AND COMPLEX: full prompt with API cheatsheet and embedded reference

#### Scenario: Tier controls reference loading

- GIVEN a tier has been classified
- WHEN the prompt is assembled for the agent
- THEN SIMPLE: NO references needed
- AND MODERATE: NO references needed
- AND COMPLEX: MANDATORY read_reference("build123d-modeling.md") FIRST

#### Scenario: Tier controls mesh deflection

**Given** a tier has been classified
**When** `generate_cad` exports STL/GLB files
**Then** the linear deflection SHALL be tier-dependent:
**And** SIMPLE: 0.1 mm linear, 0.8 angular (coarse)
**And** MODERATE: 0.05 mm linear, 0.5 angular (default)
**And** COMPLEX: 0.02 mm linear, 0.3 angular (fine)

#### Scenario: Tier controls snapshot mandate

**Given** a tier has been classified
**When** the prompt is assembled for the agent
**Then** the `MANDATORY_SNAPSHOT` directive SHALL be present only for COMPLEX tier
**And** SIMPLE and MODERATE prompts SHALL NOT require `make_snapshot`

### Tier classification runs in prompt assembly

The classification logic SHALL execute in `backend/agent/prompt.py` during prompt assembly and SHALL NOT require a separate tool call.

#### Scenario: Classification is pre-generation

**Given** a new user message arrives at the agent
**When** the system prompt is assembled for the LLM
**Then** the tier SHALL be determined before the first `run_cad_code` call
**And** the tier SHALL be embedded in the prompt as a directive
**And** the frontend SHALL receive the tier in the WebSocket event for display

### Feature count heuristic

The classifier SHALL estimate feature count from keywords, request length, and token indicators.

#### Scenario: Feature count from keywords

**Given** a user request describes "6 M4 holes with counterbores on a plate with 4 mounting bosses"
**When** the classifier parses the request
**Then** the feature count SHALL be estimated from the number of distinct features mentioned (holes + counterbores + bosses ≈ 10+ features)
**And** requests with ≥ 8 features SHALL lean toward MODERATE
**And** requests with ≥ 12 features SHALL lean toward COMPLEX

#### Scenario: Token-based estimation

**Given** a user request is over 200 characters long and contains no explicit feature dimensions
**When** the classifier evaluates the request
**Then** the token count SHALL contribute to the COMPLEX score
**And** very long requests (> 400 chars) SHALL default to COMPLEX unless explicitly simple keywords dominate

### SIMPLE failure escalates to MODERATE

When a SIMPLE-tier request fails during code generation, the system MUST automatically escalate to MODERATE tier on the next attempt.

(Reason: SIMPLE minimal prompt may lack context for borderline requests.)
(Migration: None — standard repair loop unaffected.)

#### Scenario: SIMPLE failure triggers escalation

- GIVEN a SIMPLE-tier request fails
- WHEN the agent retries the request
- THEN tier SHALL be escalated to MODERATE
- AND the MODERATE full prompt with embedded reference SHALL be used

#### Scenario: MODERATE does not escalate further

- GIVEN a request is already MODERATE (including after escalation)
- WHEN it fails again
- THEN tier SHALL remain MODERATE
- AND standard 13-attempt repair loop SHALL apply

### Optional inspect_geometry

The `inspect_geometry` tool call after successful CAD generation SHALL be optional. Post-generation validation is handled by auto-inspect (Gemini 5-view).

(Previously: inspect_geometry was mandatory after every successful run_cad_code.)

#### Scenario: inspect_geometry skipped on success

- GIVEN `run_cad_code` succeeds for a SIMPLE or MODERATE part
- WHEN the agent evaluates post-generation steps
- THEN the agent MAY skip `inspect_geometry`
- AND auto-inspect SHALL still validate the output

#### Scenario: inspect_geometry called on suspicious result

- GIVEN `run_cad_code` succeeds but auto-inspect flags suspicious bbox
- WHEN the agent evaluates post-generation steps
- THEN the agent SHOULD call `inspect_geometry` for detailed validation
