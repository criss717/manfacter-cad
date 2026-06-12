# cad-engine-ts

TypeScript CAD engine using manifold-3d and opencascade.js running in Node.js (Next.js server).

## Requirements

### Primitive shape construction

The engine MUST provide primitives: box, cylinder, sphere, torus. All operations SHALL be immutable — returning new shapes without mutating inputs.

#### Scenario: Box creation and measurement

- GIVEN box(50, 30, 10) is called
- WHEN getBoundingBox() measures the result
- THEN size SHALL be [50, 30, 10]

#### Scenario: Cylinder construction

- GIVEN cylinder(40, 8) is called
- WHEN toSTL() exports the shape
- THEN output SHALL be valid binary STL

#### Scenario: Invalid dimensions rejected

- GIVEN box(-1, 0, 2) is called
- WHEN the constructor validates inputs
- THEN a descriptive error SHALL be thrown

### Boolean operations

The engine MUST provide boolean operations: union, subtract, intersect. All operations SHALL be immutable.

#### Scenario: Union of overlapping shapes

- GIVEN two overlapping boxes
- WHEN union() combines them
- THEN result SHALL contain both volumes

#### Scenario: Subtract cylinder from box

- GIVEN box(100, 100, 100) and cylinder(200, 30)
- WHEN subtract(base, [cylinder]) is called
- THEN the cylinder hole SHALL be removed from the box

#### Scenario: Boolean on empty shape returns empty

- GIVEN an empty shape and a valid shape
- WHEN union([empty, valid]) is called
- THEN result SHALL equal the valid shape

### Mesh export

The engine MUST export STL and GLB buffers. MAY export STEP via opencascade.js.

#### Scenario: STL export from manifold mesh

- GIVEN a valid shape
- WHEN toSTL() is called
- THEN a binary STL Buffer SHALL be returned

#### Scenario: GLB export from manifold mesh

- GIVEN a valid shape
- WHEN toGLB() is called
- THEN a valid glTF 2.0 binary Buffer SHALL be returned

#### Scenario: STEP export via opencascade.js

- GIVEN opencascade.js WASM is loaded
- WHEN toSTEP() is called on a watertight mesh
- THEN a valid STEP Buffer SHALL be returned

### Inspection

The engine MUST provide geometric inspection: bounding box, volume, surface area, triangle count, and emptiness check.

#### Scenario: Bounding box on scaled shape

- GIVEN box(10, 10, 10) scaled by (2, 1, 3)
- WHEN getBoundingBox() is called
- THEN size SHALL be [20, 10, 30]

#### Scenario: Volume on union

- GIVEN two non-overlapping boxes of volume 100 each
- WHEN getVolume() is called on their union
- THEN volume SHALL be 200

#### Scenario: isEmpty on valid shape

- GIVEN box(1, 1, 1)
- WHEN isEmpty() is called
- THEN result SHALL be false

### Snapshot rendering

The engine MUST render PNG snapshots from predefined angles: front, back, top, bottom, left, right, iso.

#### Scenario: ISO snapshot

- GIVEN a valid shape
- WHEN renderPNG(shape, 'iso') is called
- THEN a PNG Buffer SHALL be returned from isometric perspective

### WASM initialization

The engine MUST initialize manifold and OCCT WASM modules lazily on first use.

#### Scenario: Lazy WASM load

- GIVEN no manifold operations have been called
- WHEN the engine module is imported
- THEN WASM SHALL NOT be loaded
- AND WASM SHALL load on first shape construction

### Parametric editing

The engine MUST expose parameter definitions via createParam() for frontend property panel integration.

#### Scenario: Numeric parameter defined

- GIVEN createParam('width', 50, {min: 10, max: 200, step: 1})
- WHEN the frontend reads parameter definitions
- THEN width SHALL appear as a tunable slider in the property panel

### Collision detection

The engine MUST support mesh-based collision detection between shapes.

#### Scenario: Two overlapping shapes collide

- GIVEN two intersecting boxes
- WHEN collision detection is run
- THEN collision SHALL be detected

#### Scenario: Two separated shapes do not collide

- GIVEN two boxes placed 100mm apart
- WHEN collision detection is run
- THEN no collision SHALL be detected

### Transforms

The engine MUST provide translate, rotate, scale, and mirror transforms. All transforms SHALL be immutable.

#### Scenario: Translate moves shape

- GIVEN box(10, 10, 10) at origin
- WHEN translate(shape, 50, 0, 0) is called
- THEN getBoundingBox().min.x SHALL be 50

#### Scenario: Scale doubles dimensions

- GIVEN box(10, 10, 10)
- WHEN scale(shape, 2, 2, 2) is called
- THEN getBoundingBox().size SHALL be [20, 20, 20]
