# Delta for cad-edge-integration

## MODIFIED Requirements

### Requirement: trimByPlane Wired to manifold-3d

The system SHALL wire `trimByPlane(normal, originOffset)` in `forgecad-api.ts` to the native `Manifold.trimByPlane` method. The `originOffset` parameter SHALL be a scalar computed as `dot(faceCenter, normal)`, NOT a Vec3.
(Previously: Throwing stub; design doc incorrectly passed Vec3 to originOffset)

#### Scenario: trimByPlane with scalar offset

- GIVEN a Manifold shape and plane normal `[0, 0, 1]`
- WHEN `trimByPlane([0, 0, 1], dot([0, 0, 5], [0, 0, 1]))` is called
- THEN the shape is trimmed at z = 5
- AND `originOffset` = 5 (scalar, not vector)

#### Scenario: trimByPlane with negative normal

- GIVEN a Manifold shape
- WHEN `trimByPlane([0, 0, -1], 5)` is called
- THEN the shape is trimmed by the plane z = -5 with inward normal

### Requirement: EdgeRef Face Normals Correctly Populated and Transformed

Topology builders SHALL populate `EdgeRef.faceNormals: [Vec3, Vec3]` for each edge with the outward normals of the two adjacent faces. Transform operations (rotate, mirror, translate) SHALL apply the appropriate transformation matrix to both normals, preserving their directional relationship to the edge.
(Previously: EdgeRef only had name, start, end — no faceNormals)

#### Scenario: Face normals populated on box edge

- GIVEN `box(10, 10, 10)`
- WHEN edge `top_front` is retrieved
- THEN `faceNormals` = `[[0, 0, 1], [0, 1, 0]]` (top Z+, front Y+)

#### Scenario: Edge normals rotate with shape

- GIVEN `box(10, 10, 10).rotate('z', 90)`
- WHEN edge `top_front` is retrieved
- THEN `faceNormals` are rotated 90° around Z axis

#### Scenario: Edge normals mirror with shape

- GIVEN `box(10, 10, 10).mirror(1, 0, 0)`
- WHEN edge normals are retrieved
- THEN normals are mirrored across the X plane

### Requirement: Modifier Stubs Replaced with Real Implementations

The `fillet` and `chamfer` methods SHALL use `faceNormals` for convex/concave detection and wedge/prism construction. `shell` SHALL remain a stub.
(Previously: Returned shape unchanged with warning)

#### Scenario: Fillet uses face normals

- GIVEN `box(10, 10, 10)`
- WHEN `fillet(shape, 2, 'top_front')`
- THEN `faceNormals` are used to compute bisector and convex/concave type
- AND a rounded edge is produced

#### Scenario: Chamfer uses edge alignment

- GIVEN `box(10, 10, 10)`
- WHEN `chamfer(shape, 2, 'top_front')`
- THEN triangular prism is extruded from `EdgeRef.start` to `EdgeRef.end`
- AND a 45° bevel is produced

### Requirement: Gear Exports

The system SHALL export `gear`, `internalGear`, and `helicalGear` from `forgecad-api.ts` and `index.ts`, making them available in the sandbox API.
(Previously: Not exported)

#### Scenario: Gear functions available in API

- GIVEN the ForgeCAD API is loaded
- WHEN `gear`, `internalGear`, `helicalGear` are accessed
- THEN all three functions are available and callable
