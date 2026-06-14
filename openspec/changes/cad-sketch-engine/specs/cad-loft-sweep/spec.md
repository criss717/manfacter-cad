# Delta for cad-loft-sweep

## ADDED Requirements

### Requirement: loft()

The system SHALL provide `loft(profiles: Sketch[], heights: number[])` that creates a `Shape` by interpolating between cross-section profiles at specified heights. The implementation SHALL generate a triangle-strip mesh connecting adjacent profile rings and cap the ends.

#### Scenario: Loft between two circles

- GIVEN `profiles = [circle2d(2), circle2d(4)]` and `heights = [0, 10]`
- WHEN the agent calls `loft(profiles, heights)`
- THEN a `Shape` SHALL be returned representing a truncated cone
- AND the shape SHALL be watertight

#### Scenario: Loft through three profiles

- GIVEN `profiles = [circle2d(2), circle2d(4), circle2d(2)]` and `heights = [0, 5, 10]`
- WHEN the agent calls `loft(profiles, heights)`
- THEN a `Shape` SHALL be returned that widens then narrows
- AND the shape SHALL be watertight

#### Scenario: Loft with mismatched profile counts

- GIVEN `profiles` with 3 elements and `heights` with 2 elements
- WHEN the agent calls `loft(profiles, heights)`
- THEN an error SHALL be thrown indicating profile/height count mismatch

#### Scenario: Loft with single profile

- GIVEN `profiles` with 1 element
- WHEN the agent calls `loft(profiles, heights)`
- THEN an error SHALL be thrown indicating at least 2 profiles are required

### Requirement: sweep()

The system SHALL provide `sweep(profile: Sketch, path: Curve3D)` that creates a `Shape` by sweeping the profile along the 3D path. The implementation SHALL use Frenet-Serret frames from the path with parallel-transport fallback for degenerate segments.

#### Scenario: Sweep circle along spline

- GIVEN `profile = circle2d(2)` and `path = spline3d([[0,0,0], [10,0,10], [20,10,20]])`
- WHEN the agent calls `sweep(profile, path)`
- THEN a `Shape` SHALL be returned representing a tube along the spline
- AND the shape SHALL be watertight

#### Scenario: Sweep along straight path

- GIVEN `profile = circle2d(2)` and `path = spline3d([[0,0,0], [0,0,10]])`
- WHEN the agent calls `sweep(profile, path)`
- THEN a `Shape` SHALL be returned equivalent to `circle2d(2).extrude(10)`

#### Scenario: Sweep with closed path

- GIVEN `profile = circle2d(1)` and a closed `Curve3D`
- WHEN the agent calls `sweep(profile, path)`
- THEN a `Shape` SHALL be returned with no gaps at the seam
- AND the shape SHALL be watertight

### Requirement: Mesh Validation

All loft and sweep results SHALL be validated with `Manifold.ofMesh()`. If the generated mesh is non-manifold, the system SHALL fall back to a union approximation or throw a descriptive error.

#### Scenario: Valid mesh passes validation

- GIVEN a loft that generates a clean triangle-strip mesh
- WHEN the mesh is passed to `Manifold.ofMesh()`
- THEN a valid `Manifold` SHALL be returned without errors

#### Scenario: Non-manifold mesh fallback

- GIVEN a loft that generates a non-manifold mesh (e.g., self-intersecting profiles)
- WHEN the mesh fails `Manifold.ofMesh()` validation
- THEN the system SHALL attempt a union approximation fallback
- AND if fallback also fails, a descriptive error SHALL be thrown

### Requirement: Triangle-Strip Generation

The loft and sweep implementations SHALL connect adjacent profile rings with triangle strips. Each ring's vertices SHALL be ordered consistently to avoid flipped normals.

#### Scenario: Consistent vertex ordering

- GIVEN two profiles with the same vertex count
- WHEN triangle strips are generated between them
- THEN all triangle normals SHALL point outward
- AND no faces SHALL be inverted

#### Scenario: Different vertex counts between profiles

- GIVEN two profiles with different vertex counts
- WHEN triangle strips are generated between them
- THEN vertices SHALL be resampled or interpolated to match counts
- AND the resulting mesh SHALL be manifold
