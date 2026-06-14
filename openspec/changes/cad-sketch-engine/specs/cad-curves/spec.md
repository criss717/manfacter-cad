# Delta for cad-curves

## ADDED Requirements

### Requirement: Curve3D Class

The system SHALL provide a `Curve3D` class that stores control points as `Vec3[]` and supports parametric evaluation. The class SHALL be immutable — all operations return new instances.

#### Scenario: Create curve from points

- GIVEN control points `[[0,0,0], [5,5,5], [10,0,0]]`
- WHEN the agent calls `new Curve3D(points)`
- THEN a `Curve3D` instance SHALL be created storing those control points

#### Scenario: Curve is immutable

- GIVEN a `Curve3D` instance `c`
- WHEN the agent calls a method that would modify `c`
- THEN `c` SHALL remain unchanged
- AND a NEW instance SHALL be returned

### Requirement: spline3d()

The system SHALL provide `spline3d(points, options?)` that creates a `Curve3D` with Catmull-Rom interpolation through all control points. Options SHALL support `closed` (boolean, default false) and `tension` (number, default 0.5).

#### Scenario: Create open spline

- GIVEN points `[[0,0,0], [10,0,10], [20,10,20]]`
- WHEN the agent calls `spline3d(points)`
- THEN a `Curve3D` SHALL be returned with Catmull-Rom interpolation
- AND the curve SHALL pass through all three points

#### Scenario: Create closed spline

- GIVEN points forming a loop and option `{ closed: true }`
- WHEN the agent calls `spline3d(points, { closed: true })`
- THEN a `Curve3D` SHALL be returned where the end connects smoothly to the start

#### Scenario: Spline with custom tension

- GIVEN points and option `{ tension: 0 }`
- WHEN the agent calls `spline3d(points, { tension: 0 })`
- THEN a `Curve3D` SHALL be returned with linear interpolation (zero tension)

### Requirement: Curve.sample()

The system SHALL provide `curve.sample(n)` that returns `n` evenly-spaced `Vec3` points along the curve parameter.

#### Scenario: Sample 10 points

- GIVEN a `Curve3D` with 4 control points
- WHEN the agent calls `curve.sample(10)`
- THEN an array of 10 `Vec3` points SHALL be returned
- AND the first point SHALL be at the curve start
- AND the last point SHALL be at the curve end

#### Scenario: Sample closed curve

- GIVEN a closed `Curve3D`
- WHEN the agent calls `curve.sample(5)`
- THEN 5 points SHALL be returned evenly spaced around the closed loop
- AND the first and last points SHALL NOT be duplicated

### Requirement: Curve.length()

The system SHALL provide `curve.length()` that returns the total arc length of the curve as a number.

#### Scenario: Get length of straight line

- GIVEN a `Curve3D` with collinear points `[[0,0,0], [10,0,0]]`
- WHEN the agent calls `curve.length()`
- THEN 10 SHALL be returned (within floating-point tolerance)

#### Scenario: Get length of curved spline

- GIVEN a `Curve3D` with non-collinear points
- WHEN the agent calls `curve.length()`
- THEN a positive number SHALL be returned greater than the straight-line distance between endpoints

### Requirement: Curve.frames()

The system SHALL provide `curve.frames(n)` that returns `n` Frenet-Serret frames `{ origin: Vec3, tangent: Vec3, normal: Vec3, binormal: Vec3 }` along the curve. For degenerate tangents (zero curvature), the system SHALL fall back to parallel-transport frames.

#### Scenario: Get frames along open curve

- GIVEN a `Curve3D` with 4 control points
- WHEN the agent calls `curve.frames(5)`
- THEN 5 frames SHALL be returned
- AND each frame SHALL have orthogonal tangent, normal, and binormal vectors

#### Scenario: Parallel-transport fallback

- GIVEN a `Curve3D` with a straight segment (zero curvature)
- WHEN the agent calls `curve.frames(10)`
- THEN frames SHALL be computed using parallel-transport for the straight segment
- AND no NaN or infinite values SHALL appear in any frame
