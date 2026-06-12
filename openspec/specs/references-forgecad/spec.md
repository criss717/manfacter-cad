# Delta for references-forgecad

## REMOVED Requirements

### Requirement: Python/build123d Reference Documentation

(Reason: API surface has migrated from Python/build123d to ForgeCAD MIT-licensed TypeScript API. Old docs reference a deprecated engine and would mislead the agent.)
(Migration: All agent prompts and code that reference `build123d-modeling.md`, `build123d-ops.md`, or any of the 13 deleted reference files SHALL instead reference the corresponding ForgeCAD docs in `references/`. The ForgeCAD docs cover equivalent operations with matching MIT license.)

## ADDED Requirements

### Requirement: ForgeCAD MIT Documentation Set

The system SHALL maintain 18 ForgeCAD MIT-licensed documentation files in the `references/` directory. These files SHALL serve as the authoritative reference for the agent's CAD code generation.

#### Scenario: All 18 ForgeCAD docs present

- GIVEN the references directory is initialized
- WHEN the system checks for required documentation
- THEN all 18 ForgeCAD MIT-licensed docs SHALL be present in `references/`
- AND each file SHALL be a valid markdown document with ForgeCAD content

#### Scenario: Agent can read ForgeCAD docs

- GIVEN the ForgeCAD docs are present in `references/`
- WHEN the agent calls `read_reference()` with a ForgeCAD doc filename
- THEN the system SHALL return the file contents
- AND the file SHALL be accessible via the same mechanism as previous reference docs

### Requirement: Reference File Validation

The system SHALL validate that reference files referenced in prompts actually exist on disk before including them in agent prompts.

#### Scenario: Missing reference excluded from prompt

- GIVEN a reference filename is listed in the prompt template
- WHEN the prompt is assembled and the file does not exist in `references/`
- THEN the reference SHALL be excluded from the prompt
- AND a warning SHALL be logged indicating the missing reference file

#### Scenario: Reference list matches filesystem

- GIVEN the system starts up
- WHEN the reference index is built
- THEN it SHALL scan the `references/` directory and include only existing files
- AND the index SHALL be regenerated if files are added or removed
