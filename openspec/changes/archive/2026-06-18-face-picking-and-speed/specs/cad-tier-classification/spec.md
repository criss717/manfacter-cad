# Delta for cad-tier-classification

## ADDED Requirements

### Requirement: SIMPLE failure escalates to MODERATE
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

### Requirement: Optional inspect_geometry
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

## MODIFIED Requirements

### Requirement: Tier-driven behavior selection

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
- GIVEN a tier has been classified
- WHEN STL/GLB files are exported
- THEN SIMPLE: 0.1mm linear / 0.8 angular (coarse)
- AND MODERATE: 0.05mm linear / 0.5 angular (default)
- AND COMPLEX: 0.02mm linear / 0.3 angular (fine)

#### Scenario: Tier controls snapshot mandate
- GIVEN a tier has been classified
- WHEN the prompt is assembled
- THEN MANDATORY_SNAPSHOT directive SHALL be present only for COMPLEX
- AND SIMPLE and MODERATE SHALL NOT require make_snapshot
