# Delta for cad-booleans-forgecad

## ADDED Requirements

### Requirement: Variadic Boolean Functions

Boolean operations SHALL accept a variadic number of shapes rather than an array. This enables natural call syntax: `union(a, b, c)` instead of `union([a, b, c])`.

#### Scenario: Union of multiple shapes

- GIVEN three or more `Shape` instances
- WHEN the agent calls `union(shape1, shape2, shape3)`
- THEN a single merged `Shape` SHALL be returned containing all input geometry
- AND the operation SHALL succeed with any number of shapes >= 2

#### Scenario: Difference of multiple shapes

- GIVEN a base shape and one or more tool shapes
- WHEN the agent calls `difference(base, tool1, tool2)`
- THEN a `Shape` SHALL be returned with all tool shapes subtracted from the base
- AND the first argument SHALL always be the base (kept) shape

#### Scenario: Intersection of multiple shapes

- GIVEN two or more `Shape` instances
- WHEN the agent calls `intersection(shape1, shape2, shape3)`
- THEN a `Shape` SHALL be returned containing only the volume common to all inputs

#### Scenario: Single shape passed to variadic boolean

- GIVEN a single `Shape` instance
- WHEN the agent calls `union(singleShape)` or `difference(singleShape)`
- THEN the function SHALL return the input shape unchanged (no-op)

## RENAMED Requirements

### Requirement: subtract → difference

(Reason: Align with ForgeCAD naming convention and standard CAD terminology)
(Migration: All references to `subtract()` MUST be replaced with `difference()`. The variadic signature replaces the two-argument signature: `subtract(a, b)` becomes `difference(a, b)`)

### Requirement: intersect → intersection

(Reason: Align with ForgeCAD naming convention; `intersection` is the standard noun form used in CAD APIs)
(Migration: All references to `intersect()` MUST be replaced with `intersection()`. The variadic signature replaces the two-argument signature: `intersect(a, b)` becomes `intersection(a, b)`)
