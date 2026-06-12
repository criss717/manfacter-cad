# Delta for cad-tier-classification

## MODIFIED Requirements

### Tier classification from keyword heuristics

The system SHALL classify every user request into SIMPLE, MODERATE, or COMPLEX tiers using CAD-engine-agnostic keyword heuristics applied to the user message before the first `runCadCode` call.
(Previously: build123d-specific keywords like BuildPart, BuildSketch, BuildLine)

#### Scenario: SIMPLE part recognized

- GIVEN a user requests a "box of 100x60x20 mm" or a "cylinder with 4 holes"
- WHEN the request matches SIMPLE keywords (box, cylinder, sphere, torus, chamfer, fillet, plate, spacer, washer, bracket (simple), shaft)
- AND estimated code length is under 50 lines
- THEN tier SHALL be classified as SIMPLE
- AND `readReference` SHALL NOT be required before code generation
- AND coarse mesh deflection SHALL be used for export

#### Scenario: MODERATE part recognized

- GIVEN a user requests a "bracket with ribs and a cutout" or a "flanged pipe with bolt pattern"
- WHEN the request has more than 5 features but fewer than 12
- AND the feature count falls between SIMPLE and COMPLEX thresholds
- AND the request does not reference gears, sweeps, lofts, assemblies > 2 parts, or Boolean chains > 3
- THEN tier SHALL be classified as MODERATE
- AND `readReference` SHALL NOT be required before code generation
- AND default mesh deflection SHALL be used for export

#### Scenario: COMPLEX part recognized

- GIVEN a user requests a "helical gear with 24 teeth" or a "turbine blade with aerodynamic profile"
- WHEN the request matches COMPLEX keywords (gear with teeth, helical, sweep, loft, revolve, cam, spline, shell/hollow, text embossing, assemblies > 2 parts, Boolean chain > 3 operations)
- OR estimated code length exceeds 60 lines
- OR the request contains "assembly"/"boolean"/"fillet" tokens with high feature count
- THEN tier SHALL be classified as COMPLEX
- AND `readReference("manifold-modeling.md")` SHALL be required before code generation
- AND fine mesh deflection SHALL be used for export
- AND `renderPNG` SHALL be mandatory after generation

### Tier-driven behavior selection

The classified tier SHALL drive three downstream behaviors: reference loading policy, mesh deflection, and snapshot requirement.

#### Scenario: Tier controls reference loading

- GIVEN a tier has been classified
- WHEN the prompt is assembled for the agent
- THEN the instruction SHALL include tier-specific reference rules:
- AND SIMPLE: "NO references needed" with API cheatsheet already in prompt
- AND MODERATE: "NO references needed" with API cheatsheet already in prompt
- AND COMPLEX: "MANDATORY: call readReference('manifold-modeling.md') FIRST"

#### Scenario: Tier controls mesh deflection

- GIVEN a tier has been classified
- WHEN CAD code exports STL/GLB files
- THEN mesh refinement SHALL be tier-dependent:
- AND SIMPLE: coarse refinement (lower triangle count)
- AND MODERATE: default refinement
- AND COMPLEX: fine refinement (higher triangle count)

#### Scenario: Tier controls snapshot mandate

- GIVEN a tier has been classified
- WHEN the prompt is assembled for the agent
- THEN the `MANDATORY_SNAPSHOT` directive SHALL be present only for COMPLEX tier
- AND SIMPLE and MODERATE prompts SHALL NOT require snapshot

## REMOVED Requirements

### build123d-specific COMPLEX keywords

(Reason: build123d API constructs (BuildPart, BuildSketch, BuildLine) are replaced by manifold-3d equivalents (boolean chain complexity, sweep/loft approximations, assembly part count).)
(Migration: Tier classifier now uses manifold-3d-agnostic keywords. Old build123d keyword references in prompt.py are replaced by generic CAD complexity indicators.)

### build123d-specific deflection values

(Reason: Deflection parameters (0.1/0.8, 0.05/0.5, 0.02/0.3) were specific to BRepMesh_IncrementalMesh. manifold-3d uses mesh refinement levels instead of linear/angular deflection.)
(Migration: Mesh quality is now set via manifold refinement level (coarse/default/fine) rather than OCP deflection values.)
