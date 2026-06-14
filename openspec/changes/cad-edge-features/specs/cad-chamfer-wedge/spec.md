# Delta for cad-chamfer-wedge

## MODIFIED Requirements

### Requirement: Chamfer via Triangular CrossSection Extrusion

The system SHALL implement `chamfer(shape, distance, edges?)` by constructing a right-triangle CrossSection with legs equal to `distance`, extruding it along the edge direction, and subtracting the resulting prism from the shape. The triangle vertices SHALL be `[(0, 0), (distance, 0), (0, distance)]` producing a 45° bevel on both adjacent faces.
(Previously: Rotated box subtraction producing approximate bevel, not exact 45°)

#### Scenario: Chamfer on single edge

- GIVEN `box(10, 10, 10)`
- WHEN `chamfer(shape, 2, 'top_front')`
- THEN a 45° bevel of 2 units on each adjacent face is produced
- AND the bevel surface is flat (not curved)

#### Scenario: Chamfer on all edges

- GIVEN `box(10, 10, 10)`
- WHEN `chamfer(shape, 1)` (no edge filter)
- THEN all 12 edges receive a 45° bevel of 1 unit

#### Scenario: Distance exceeds edge length

- GIVEN `box(4, 4, 4)` with edge length 4
- WHEN `chamfer(shape, 3, 'top_front')` (distance × 2 > edge length)
- THEN the operation is skipped with a warning
- AND the shape is returned unchanged

#### Scenario: Chamfer triangle profile geometry

- GIVEN `distance = 2`
- WHEN the CrossSection is constructed
- THEN vertices are `[(0, 0), (2, 0), (0, 2)]`
- AND the hypotenuse forms a 45° angle with both axes
