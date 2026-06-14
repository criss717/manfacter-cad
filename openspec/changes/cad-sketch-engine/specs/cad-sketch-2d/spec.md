# Delta for cad-sketch-2d

## ADDED Requirements

### Requirement: Sketch Class

The system SHALL provide an immutable `Sketch` class that wraps `manifold-3d`'s `CrossSection`. All operations return new `Sketch` instances (no mutation). The class SHALL expose a `getCrossSection()` accessor for direct `CrossSection` access.

#### Scenario: Create empty sketch

- GIVEN no arguments
- WHEN the agent calls `new Sketch()`
- THEN an empty `Sketch` instance SHALL be returned
- AND `getCrossSection()` SHALL return a valid `CrossSection`

#### Scenario: Sketch is immutable

- GIVEN a `Sketch` instance `s` created via `rect(10, 10)`
- WHEN the agent calls `s.union2d(circle2d(3))`
- THEN `s` SHALL remain unchanged
- AND a NEW `Sketch` instance SHALL be returned with the union result

### Requirement: Rect Primitive

The system SHALL provide `rect(width, height, center?)` that creates a rectangular `Sketch`. The rectangle SHALL be centered at origin by default.

#### Scenario: Create centered rectangle

- GIVEN width=10 and height=5
- WHEN the agent calls `rect(10, 5)`
- THEN a `Sketch` SHALL be returned with a 10x5 rectangle centered at origin

#### Scenario: Create non-centered rectangle

- GIVEN width=10, height=5, and center=false
- WHEN the agent calls `rect(10, 5, false)`
- THEN a `Sketch` SHALL be returned with bottom-left corner at origin

### Requirement: Circle2D Primitive

The system SHALL provide `circle2d(radius, center?, segments?)` that creates a circular `Sketch`.

#### Scenario: Create circle with radius

- GIVEN radius=3
- WHEN the agent calls `circle2d(3)`
- THEN a `Sketch` SHALL be returned with a circle of radius 3 centered at origin

#### Scenario: Create circle with custom segments

- GIVEN radius=3 and segments=6
- WHEN the agent calls `circle2d(3, undefined, 6)`
- THEN a `Sketch` SHALL be returned with a hexagonal approximation of the circle

### Requirement: RoundedRect Primitive

The system SHALL provide `roundedRect(width, height, radius, center?)` that creates a rectangle with rounded corners.

#### Scenario: Create rounded rectangle

- GIVEN width=10, height=5, radius=1
- WHEN the agent calls `roundedRect(10, 5, 1)`
- THEN a `Sketch` SHALL be returned with rounded corners of radius 1

### Requirement: Polygon Primitive

The system SHALL provide `polygon(points[])` that creates a `Sketch` from an array of 2D points `[x, y][]`.

#### Scenario: Create triangle from points

- GIVEN points `[[0,0], [10,0], [5,10]]`
- WHEN the agent calls `polygon(points)`
- THEN a `Sketch` SHALL be returned with a triangular shape

#### Scenario: Polygon with collinear points

- GIVEN points that include collinear vertices
- WHEN the agent calls `polygon(points)`
- THEN a valid `Sketch` SHALL be returned (collinear points tolerated or simplified)

### Requirement: Ngons and Star Primitives

The system SHALL provide `ngon(sides, radius, center?)` and `star(outerRadius, innerRadius, points, center?)` primitives.

#### Scenario: Create regular hexagon

- GIVEN sides=6 and radius=5
- WHEN the agent calls `ngon(6, 5)`
- THEN a `Sketch` SHALL be returned with a regular hexagon

#### Scenario: Create 5-pointed star

- GIVEN outerRadius=5, innerRadius=2, points=5
- WHEN the agent calls `star(5, 2, 5)`
- THEN a `Sketch` SHALL be returned with a 5-pointed star

### Requirement: Ellipse and Slot Primitives

The system SHALL provide `ellipse(rx, ry, center?)` and `slot(length, radius, center?)` primitives.

#### Scenario: Create ellipse

- GIVEN rx=5, ry=3
- WHEN the agent calls `ellipse(5, 3)`
- THEN a `Sketch` SHALL be returned with an ellipse of the given radii

#### Scenario: Create slot

- GIVEN length=10, radius=2
- WHEN the agent calls `slot(10, 2)`
- THEN a `Sketch` SHALL be returned with a slot (stadium shape) of length 10 and end radius 2

### Requirement: Union2D

The system SHALL provide `sketch.union2d(other)` that returns a new `Sketch` containing the union of both cross-sections.

#### Scenario: Union two non-overlapping shapes

- GIVEN `rect(10, 10)` and `circle2d(3)` positioned apart
- WHEN the agent calls `sketch.union2d(other)`
- THEN a `Sketch` SHALL be returned containing both shapes

#### Scenario: Union two overlapping shapes

- GIVEN two overlapping rectangles
- WHEN the agent calls `sketch.union2d(other)`
- THEN a `Sketch` SHALL be returned with the merged outline

### Requirement: Difference2D

The system SHALL provide `sketch.difference2d(other)` that subtracts the other cross-section from this one.

#### Scenario: Cut hole from rectangle

- GIVEN `rect(10, 10)` and `circle2d(2)` centered inside
- WHEN the agent calls `sketch.difference2d(circle)`
- THEN a `Sketch` SHALL be returned with a rectangular outline and circular hole

#### Scenario: Difference with non-overlapping shape

- GIVEN two non-overlapping sketches
- WHEN the agent calls `sketch.difference2d(other)`
- THEN the original `Sketch` SHALL be returned unchanged

### Requirement: Intersection2D

The system SHALL provide `sketch.intersection2d(other)` that returns only the overlapping region.

#### Scenario: Intersect overlapping shapes

- GIVEN two overlapping circles
- WHEN the agent calls `sketch.intersection2d(other)`
- THEN a `Sketch` SHALL be returned with only the lens-shaped overlap

### Requirement: Hull2D

The system SHALL provide `sketch.hull2d(other)` that creates the convex hull of both cross-sections.

#### Scenario: Hull of two circles

- GIVEN two circles separated by distance
- WHEN the agent calls `sketch.hull2d(other)`
- THEN a `Sketch` SHALL be returned with the convex hull enclosing both circles

### Requirement: Offset

The system SHALL provide `sketch.offset(delta)` that expands (positive) or shrinks (negative) the cross-section.

#### Scenario: Expand sketch outward

- GIVEN `rect(10, 10)` and delta=1
- WHEN the agent calls `sketch.offset(1)`
- THEN a `Sketch` SHALL be returned approximately 12x12 (expanded by 1 on each side)

#### Scenario: Shrink sketch inward

- GIVEN `rect(10, 10)` and delta=-1
- WHEN the agent calls `sketch.offset(-1)`
- THEN a `Sketch` SHALL be returned approximately 8x8

### Requirement: FilletCorners

The system SHALL provide `sketch.filletCorners(radius)` that rounds all sharp corners of the sketch.

#### Scenario: Fillet rectangle corners

- GIVEN `rect(10, 10)` and radius=2
- WHEN the agent calls `sketch.filletCorners(2)`
- THEN a `Sketch` SHALL be returned with all four corners rounded to radius 2

#### Scenario: Fillet with radius larger than half edge

- GIVEN `rect(4, 4)` and radius=3
- WHEN the agent calls `sketch.filletCorners(3)`
- THEN a valid `Sketch` SHALL be returned (radius clamped or gracefully handled)
