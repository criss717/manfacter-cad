# Delta for cad-stubs-forgecad

## ADDED Requirements

### Requirement: Group Stub

The system SHALL provide a `group(...shapes)` function that collects multiple shapes into a logical group. The stub SHALL accept shapes and return a group object but SHALL NOT perform any geometric operation.

#### Scenario: Create group from shapes

- GIVEN two or more `Shape` instances
- WHEN the agent calls `group(shape1, shape2)`
- THEN a group object SHALL be returned containing references to all input shapes
- AND the group SHALL be iterable or convertible back to individual shapes

#### Scenario: Empty group

- GIVEN no shapes
- WHEN the agent calls `group()`
- THEN an empty group SHALL be returned
- AND calling operations on an empty group SHALL be a no-op

### Requirement: Hull3D Stub

The system SHALL provide a `hull3d(...shapes)` stub function. The stub SHALL accept shapes and return a placeholder `Shape` indicating the operation is not yet implemented.

#### Scenario: Hull3D called

- GIVEN two or more `Shape` instances
- WHEN the agent calls `hull3d(shape1, shape2)`
- THEN the function SHALL return a placeholder `Shape`
- AND a warning SHALL be logged indicating hull3d is not yet implemented

### Requirement: Modifier Stubs (fillet, chamfer, shell)

The system SHALL provide stub implementations for `fillet`, `chamfer`, and `shell` operations. Each stub SHALL accept the expected ForgeCAD signature and return a placeholder.

#### Scenario: Fillet stub

- GIVEN a `Shape` instance
- WHEN the agent calls `.fillet(radius, edges?)` as a chainable method
- THEN the stub SHALL return the original shape unchanged
- AND a warning SHALL be logged indicating fillet is not yet implemented

#### Scenario: Chamfer stub

- GIVEN a `Shape` instance
- WHEN the agent calls `.chamfer(distance, edges?)` as a chainable method
- THEN the stub SHALL return the original shape unchanged
- AND a warning SHALL be logged indicating chamfer is not yet implemented

#### Scenario: Shell stub

- GIVEN a `Shape` instance
- WHEN the agent calls `.shell(thickness, facesToOpen?)` as a chainable method
- THEN the stub SHALL return the original shape unchanged
- AND a warning SHALL be logged indicating shell is not yet implemented

### Requirement: Pattern Stubs (linearPattern, circularPattern)

The system SHALL provide stub implementations for `linearPattern` and `circularPattern`. Each stub SHALL accept the expected ForgeCAD signature and return a placeholder group.

#### Scenario: Linear pattern stub

- GIVEN a `Shape` instance
- WHEN the agent calls `.linearPattern(count, spacing, axis?)` as a chainable method
- THEN the stub SHALL return a group containing the original shape repeated `count` times (as references, not copies)
- AND a warning SHALL be logged indicating linearPattern is not yet implemented

#### Scenario: Circular pattern stub

- GIVEN a `Shape` instance
- WHEN the agent calls `.circularPattern(count, angle, axis?)` as a chainable method
- THEN the stub SHALL return a group containing the original shape repeated `count` times (as references, not copies)
- AND a warning SHALL be logged indicating circularPattern is not yet implemented
