# Delta for agent-prompt-fix

## MODIFIED Requirements

### Requirement: Corrected Primitive Signatures in Prompt

(Previously: prompt.ts contained incorrect cylinder parameter order, wrong mirror type, and false claim about box centering)

The system SHALL ensure `prompt.ts` documents primitive signatures that match the actual ForgeCAD-aligned API.

#### Scenario: Cylinder parameter order corrected

- GIVEN the agent reads the CAD API documentation from the prompt
- WHEN the prompt describes the `cylinder` primitive
- THEN it SHALL list `radiusTop` as the first parameter and `height` as the second
- AND optional parameters `radiusBottom`, `segments`, `center` SHALL be documented after required params

#### Scenario: Mirror type corrected

- GIVEN the agent reads the CAD API documentation from the prompt
- WHEN the prompt describes the `mirror` operation
- THEN it SHALL specify that mirror accepts a plane normal vector `(nx, ny, nz)` as numeric parameters
- AND it SHALL NOT describe mirror as accepting a point or axis name

#### Scenario: Box centering claim removed

- GIVEN the agent reads the CAD API documentation from the prompt
- WHEN the prompt describes the `box` primitive
- THEN it SHALL NOT claim the box is centered at origin by default
- AND it SHALL describe the box as starting from origin with positive extents

### Requirement: ForgeCAD Documentation References

(Previously: prompt.ts referenced non-existent guide files and outdated Python/build123d docs)

The system SHALL reference only ForgeCAD MIT-licensed documentation in agent prompts.

#### Scenario: Prompt references ForgeCAD docs

- GIVEN the agent prompt is assembled
- WHEN reference documentation paths are included
- THEN all references SHALL point to files in the `references/` directory containing ForgeCAD MIT-licensed docs
- AND no references SHALL point to deleted Python/build123d documentation

#### Scenario: Non-existent guide removed

- GIVEN the agent prompt is assembled
- WHEN the prompt lists available reference files
- THEN it SHALL NOT include any guide file that does not exist in the `references/` directory
- AND the file list SHALL be validated against actual filesystem contents at startup

## ADDED Requirements

### Requirement: Updated Sandbox Bindings

The system SHALL export the new ForgeCAD-aligned API surface to the agent sandbox via `tools.ts`.

#### Scenario: New API surface exported

- GIVEN the agent sandbox is initialized
- WHEN the sandbox receives CAD functions
- THEN it SHALL include: `box`, `cylinder`, `sphere`, `union`, `difference`, `intersection`, `group`, `hull3d`
- AND it SHALL include `Shape` class constructor and `TrackedShape` class constructor

#### Scenario: Old API removed from sandbox

- GIVEN the agent sandbox is initialized
- WHEN the sandbox receives CAD functions
- THEN it SHALL NOT include: `subtract`, `intersect` (old names)
- AND it SHALL NOT include free-function transforms that are now chainable methods
