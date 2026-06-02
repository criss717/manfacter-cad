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

The classified tier SHALL drive three downstream behaviors: reference loading policy, mesh deflection, and snapshot requirement.

#### Scenario: Tier controls reference loading

**Given** a tier has been classified
**When** the prompt is assembled for the agent
**Then** the instruction SHALL include tier-specific reference rules:
**And** SIMPLE: "NO references needed" with API cheatsheet already in prompt
**And** MODERATE: "NO references needed" with API cheatsheet already in prompt
**And** COMPLEX: "MANDATORY: call read_reference("build123d-modeling.md") FIRST"

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
