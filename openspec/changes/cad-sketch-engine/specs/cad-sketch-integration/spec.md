# Delta for cad-sketch-integration

## ADDED Requirements

### Requirement: Replace Sketch Stubs in forgecad-api.ts

The system SHALL replace all sketch-related stub functions in `forgecad-api.ts` (`rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star`, `union2d`, `difference2d`, `intersection2d`, `hull2d`, `filletCorners`) with real implementations that return `Sketch` instances backed by `CrossSection`.

#### Scenario: rect() returns working Sketch

- GIVEN the module `forgecad-api.ts` is loaded
- WHEN the agent calls `rect(10, 5)`
- THEN a functional `Sketch` instance SHALL be returned (no error thrown)
- AND the sketch SHALL be usable with `.extrude()` and `.union2d()`

#### Scenario: circle2d() returns working Sketch

- GIVEN the module `forgecad-api.ts` is loaded
- WHEN the agent calls `circle2d(3)`
- THEN a functional `Sketch` instance SHALL be returned
- AND `circle2d(3).extrude(10)` SHALL produce a valid `Shape`

#### Scenario: 2D boolean operations work

- GIVEN `rect(10, 10)` and `circle2d(3)`
- WHEN the agent calls `rect(10, 10).union2d(circle2d(3))`
- THEN a valid `Sketch` SHALL be returned
- AND the result SHALL be extrudable to a `Shape`

### Requirement: Replace Curve Stubs in forgecad-api.ts

The system SHALL replace `spline3d` and `Curve3D` stubs in `forgecad-api.ts` with real implementations.

#### Scenario: spline3d() returns working Curve3D

- GIVEN the module `forgecad-api.ts` is loaded
- WHEN the agent calls `spline3d([[0,0,0], [10,0,10], [20,10,20]])`
- THEN a functional `Curve3D` instance SHALL be returned
- AND `.sample(5)` SHALL return 5 `Vec3` points

### Requirement: Replace Surfacing Stubs in forgecad-api.ts

The system SHALL replace `loft` and `sweep` stubs in `forgecad-api.ts` with real implementations.

#### Scenario: loft() returns valid Shape

- GIVEN the module `forgecad-api.ts` is loaded
- WHEN the agent calls `loft([circle2d(2), circle2d(4)], [0, 10])`
- THEN a valid `Shape` SHALL be returned
- AND the shape SHALL be exportable to GLB

#### Scenario: sweep() returns valid Shape

- GIVEN the module `forgecad-api.ts` is loaded
- WHEN the agent calls `sweep(circle2d(2), spline3d([[0,0,0], [10,0,10], [20,10,20]]))`
- THEN a valid `Shape` SHALL be returned
- AND the shape SHALL be watertight

### Requirement: Export New Types from cad/index.ts

The system SHALL export `Sketch`, `Curve3D`, `spline3d`, `loft`, and `sweep` from `src/cad/index.ts` so the AI agent can import them without errors.

#### Scenario: Import Sketch from cad index

- GIVEN the `src/cad/index.ts` module
- WHEN the agent imports `{ Sketch, rect, circle2d }` from the cad index
- THEN all imports SHALL resolve without TypeScript errors

#### Scenario: Import Curve3D from cad index

- GIVEN the `src/cad/index.ts` module
- WHEN the agent imports `{ Curve3D, spline3d, loft, sweep }` from the cad index
- THEN all imports SHALL resolve without TypeScript errors

### Requirement: CrossSection Accessible via Engine

The system SHALL ensure `CrossSection` from `manifold-3d` is accessible via the engine module (`getManifold()` or equivalent accessor) so that `Sketch` can wrap it internally.

#### Scenario: Access CrossSection from engine

- GIVEN the engine module is loaded
- WHEN the agent accesses the `CrossSection` type or constructor
- THEN it SHALL be available for use in `Sketch` internals

## MODIFIED Requirements

### Requirement: Group Stub

(Previously: Provided only a stub that collects shapes without geometric operations)

The system SHALL provide a `group(...shapes)` function that collects multiple shapes into a logical group. The function SHALL accept shapes and return a group object. Existing behavior for non-sketch shapes SHALL remain unchanged.

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

(Previously: Returned placeholder with warning)

The system SHALL provide a `hull3d(...shapes)` function. If a real implementation is available, it SHALL compute the 3D convex hull. Otherwise, it SHALL return a placeholder `Shape` with a warning indicating hull3d is not yet fully implemented.

#### Scenario: Hull3D called

- GIVEN two or more `Shape` instances
- WHEN the agent calls `hull3d(shape1, shape2)`
- THEN the function SHALL return a `Shape` (real or placeholder)
- AND if placeholder, a warning SHALL be logged

## REMOVED Requirements

### Requirement: Sketch Stub Functions

(Reason: All sketch stubs (`rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star`, `union2d`, `difference2d`, `intersection2d`, `hull2d`, `filletCorners`, `path`, `stroke`, `constrainedSketch`, `sketchFromSvg`, `dxfSketch`, `svgSketch`) are replaced with real implementations. The `Sketch` and `ConstraintSketch` class stubs are replaced with working classes.)
(Migration: Consumers that previously caught errors from these stubs can now use the functions directly. Code that used workarounds (e.g., approximating 2D profiles with 3D booleans) can be simplified to use the real sketch API.)

### Requirement: Curve3D Stub

(Reason: `Curve3D` class stub and `spline3d` stub are replaced with real Catmull-Rom interpolation implementation.)
(Migration: Code that previously caught `curveStub()` errors can now use `spline3d()` and `Curve3D` directly.)

### Requirement: Loft/Sweep Stubs

(Reason: `loft` and `sweep` stubs are replaced with real triangle-strip mesh generation implementations.)
(Migration: Code that previously caught `curveStub()` errors for loft/sweep can now use these functions directly.)
