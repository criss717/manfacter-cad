# Delta for cad-extrude-revolve

## ADDED Requirements

### Requirement: Sketch.extrude()

The system SHALL provide `sketch.extrude(height)` that returns a `Shape` by extruding the sketch's cross-section along the Z axis. The method SHALL delegate to `CrossSection.extrude(height)`.

#### Scenario: Extrude rectangle to box

- GIVEN `rect(10, 5)` and height=2
- WHEN the agent calls `sketch.extrude(2)`
- THEN a `Shape` SHALL be returned equivalent to `box(10, 5, 2)`
- AND the shape's bounding box SHALL span Z from 0 to 2

#### Scenario: Extrude circle to cylinder

- GIVEN `circle2d(3)` and height=10
- WHEN the agent calls `sketch.extrude(10)`
- THEN a `Shape` SHALL be returned equivalent to `cylinder(10, 3)`
- AND the shape SHALL be watertight

#### Scenario: Extrude with negative height

- GIVEN `rect(10, 10)` and height=-5
- WHEN the agent calls `sketch.extrude(-5)`
- THEN a `Shape` SHALL be returned extending from Z=0 to Z=-5

#### Scenario: Extrude sketch with hole

- GIVEN `rect(10, 10).difference2d(circle2d(2))` and height=3
- WHEN the agent calls `sketch.extrude(3)`
- THEN a `Shape` SHALL be returned with a through-hole of diameter 4

### Requirement: Sketch.revolve()

The system SHALL provide `sketch.revolve(segments?)` that returns a `Shape` by revolving the sketch's cross-section around the Z axis. The method SHALL delegate to `CrossSection.revolve(segments)`. Default segments SHALL be 64.

#### Scenario: Revolve circle to sphere-like shape

- GIVEN `circle2d(3)` and segments=32
- WHEN the agent calls `sketch.revolve(32)`
- THEN a `Shape` SHALL be returned representing the revolved profile
- AND the shape SHALL be watertight

#### Scenario: Revolve with default segments

- GIVEN `circle2d(2)`
- WHEN the agent calls `sketch.revolve()`
- THEN a `Shape` SHALL be returned using 64 segments
- AND the shape SHALL have smooth surface quality

#### Scenario: Revolve rectangle to cylinder

- GIVEN `rect(4, 0)` positioned at radius 2 from origin and segments=32
- WHEN the agent calls `sketch.revolve(32)`
- THEN a `Shape` SHALL be returned approximating a cylinder
