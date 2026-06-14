# Delta for cad-fillet-wedge

## MODIFIED Requirements

### Requirement: Fillet via Wedge Intersection

The system SHALL implement `fillet(shape, radius, edges?)` by constructing a quarter-cylinder via intersection of a full cylinder with a wedge produced by `trimByPlane` on the two adjacent face planes. The cylinder offset from the edge SHALL be `radius / cos(φ/2)` where φ is the dihedral angle between faces. Convex edges (`dot(n1, n2) ≤ 0`) SHALL use `difference(shape, quarterCylinder)`; concave edges (`dot(n1, n2) > 0`) SHALL use `union(shape, quarterCylinder)`.
(Previously: Full-cylinder union regardless of edge type, no wedge intersection, no offset formula)

#### Scenario: Fillet on orthogonal convex edge

- GIVEN `box(10, 10, 10)` with `faceNormals = [[0,0,1], [0,1,0]]`
- WHEN `fillet(shape, 2, 'top_front')`
- THEN quarter-cylinder tangent to both faces is subtracted
- AND the resulting edge is rounded with radius 2

#### Scenario: Fillet on concave edge

- GIVEN a shape with adjacent faces where `dot(n1, n2) > 0`
- WHEN `fillet(shape, radius, edgeName)`
- THEN quarter-cylinder is unioned (material added)
- AND the resulting internal corner is rounded

#### Scenario: Oversized radius exceeds edge length

- GIVEN `box(4, 4, 4)` with edge length 4
- WHEN `fillet(shape, 3, 'top_front')` (radius × 2 > edge length)
- THEN the operation is skipped with a warning
- AND the shape is returned unchanged

#### Scenario: Bisector offset calculation

- GIVEN orthogonal faces (φ = 90°)
- WHEN computing offset for `radius = 2`
- THEN offset = `2 / cos(45°)` ≈ 2.828 along the bisector direction

### Requirement: EdgeRef Face Normals for Fillet

`EdgeRef.faceNormals: [Vec3, Vec3]` SHALL be populated by topology builders for each edge, representing the outward normals of the two faces meeting at that edge. Transform operations (rotate, mirror) SHALL apply the same transformation to both normals.
(Previously: EdgeRef only had name, start, end — no faceNormals)

#### Scenario: Face normals populated on box edge

- GIVEN `box(10, 10, 10)`
- WHEN edge `top_front` is retrieved
- THEN `faceNormals` = `[[0, 0, 1], [0, 1, 0]]`

#### Scenario: Face normals rotate with shape

- GIVEN `box(10, 10, 10).rotate('z', 90)`
- WHEN edge `top_front` is retrieved
- THEN `faceNormals` are rotated 90° around Z axis
