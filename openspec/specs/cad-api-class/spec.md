# Delta for cad-api-class

## ADDED Requirements

### Requirement: TrackedShape with Named Faces

The system SHALL provide a `TrackedShape` class extending `Shape` that tracks named faces for primitive solids. Named faces enable the agent to reference specific surfaces for operations like holes, fillets, and attachments.

#### Scenario: Box has 6 named faces

- GIVEN a `TrackedShape` created via `box(x, y, z)`
- WHEN the agent queries available faces
- THEN the shape SHALL expose faces: `top`, `bottom`, `front`, `back`, `left`, `right`
- AND each face SHALL be addressable by name in subsequent operations

#### Scenario: Cylinder has 3 named faces

- GIVEN a `TrackedShape` created via `cylinder(radiusTop, height, ...)`
- WHEN the agent queries available faces
- THEN the shape SHALL expose faces: `top`, `bottom`, `side`
- AND the `side` face SHALL represent the cylindrical surface

#### Scenario: Non-tracked shape has no named faces

- GIVEN a plain `Shape` (not `TrackedShape`)
- WHEN the agent queries available faces
- THEN the shape SHALL return an empty face map
- AND operations requiring named faces SHALL throw a descriptive error

### Requirement: Primitive Signatures Match ForgeCAD

All primitive constructors SHALL match ForgeCAD's parameter signatures exactly.

#### Scenario: Box primitive signature

- GIVEN the agent calls `box(x, y, z)`
- WHEN the primitive is created
- THEN it SHALL accept exactly 3 numeric parameters: width (x), depth (y), height (z)
- AND the box SHALL be centered at origin by default

#### Scenario: Cylinder primitive signature

- GIVEN the agent calls `cylinder(radiusTop, height, ...)`
- WHEN the primitive is created
- THEN it SHALL accept `radiusTop` as first param, `height` as second
- AND it SHALL support optional params: `radiusBottom`, `segments`, `center`

## MODIFIED Requirements

### Requirement: Shape as Class with Chainable Methods

(Previously: Shape was an interface; transforms were free functions taking Shape as first argument)

The system SHALL implement `Shape` as a concrete class with chainable transformation methods. All transform operations return `this` to enable method chaining.

#### Scenario: Chainable translate

- GIVEN a `Shape` instance created via `box(10, 10, 10)`
- WHEN the agent calls `.translate(5, 0, 0).rotate(0, 90, 0)`
- THEN each method SHALL return the same `Shape` instance
- AND the shape SHALL have both transformations applied

#### Scenario: Chainable rotate

- GIVEN a `Shape` instance
- WHEN the agent calls `.rotate(xDeg, yDeg, zDeg)`
- THEN the shape SHALL be rotated around each axis by the specified degrees
- AND the method SHALL return `this` for chaining

#### Scenario: Chainable scale

- GIVEN a `Shape` instance
- WHEN the agent calls `.scale(factor)` or `.scale(x, y, z)`
- THEN the shape SHALL be scaled uniformly or per-axis
- AND the method SHALL return `this` for chaining

#### Scenario: Chainable mirror

- GIVEN a `Shape` instance
- WHEN the agent calls `.mirror(normalX, normalY, normalZ)`
- THEN the shape SHALL be mirrored across the plane defined by the normal vector
- AND the method SHALL return `this` for chaining

### Requirement: Export via Method

(Previously: Export was a free function `export(shape, format)`)

The system SHALL provide export as an instance method on `Shape`.

#### Scenario: Export to STEP

- GIVEN a `Shape` instance
- WHEN the agent calls `.toSTEP(path)`
- THEN the shape SHALL be serialized to STEP format at the given path

#### Scenario: Export to STL

- GIVEN a `Shape` instance
- WHEN the agent calls `.toSTL(path, options?)`
- THEN the shape SHALL be serialized to STL format with optional deflection settings

### Requirement: Inspection via Method

(Previously: Inspection was a free function `inspect(shape)`)

The system SHALL provide inspection as an instance method on `Shape`.

#### Scenario: Get bounding box

- GIVEN a `Shape` instance
- WHEN the agent calls `.getBounds()`
- THEN it SHALL return `{ minX, minY, minZ, maxX, maxY, maxZ }`

#### Scenario: Get volume

- GIVEN a `Shape` instance
- WHEN the agent calls `.getVolume()`
- THEN it SHALL return the shape's volume in cubic units
