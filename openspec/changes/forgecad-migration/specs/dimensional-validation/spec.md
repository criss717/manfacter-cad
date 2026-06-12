# Delta for dimensional-validation

## MODIFIED Requirements

### Bbox comparison against request

After every successful `runCadCode` call, the system SHALL compare the generated model's bounding box (from manifold-3d mesh bbox) against the dimensional expectations extracted from the user's request.
(Previously: Bbox from OCP B-rep via STEP file round-trip)

#### Scenario: Bbox matches request within tolerance

- GIVEN a user requests a "100x60x20 mm plate"
- AND the generated manifold mesh has bbox dimensions 100.0 x 60.0 x 20.0 mm
- WHEN dimensional validation runs post-generation
- THEN the check SHALL pass
- AND no correction SHALL be triggered

#### Scenario: Bbox deviates beyond 20% threshold

- GIVEN a user requests a "100x60x20 mm plate"
- AND the generated mesh has bbox dimensions 80.0 x 60.0 x 20.0 mm (20% off in X)
- WHEN dimensional validation runs
- THEN the check SHALL flag the X dimension as a mismatch
- AND a correction SHALL be triggered
- AND the agent SHALL receive expected vs actual dimensions

#### Scenario: Bbox deviates within 20% threshold

- GIVEN a user requests a "100x60x20 mm plate"
- AND the generated mesh has bbox dimensions 95.0 x 58.0 x 21.0 mm
- WHEN dimensional validation runs
- THEN the check SHALL pass (all dimensions within 20%)
- AND no correction SHALL be triggered

## REMOVED Requirements

### Inspection method references to OCP B-rep

(Reason: The current spec references build123d/OCP-specific bbox extraction via STEP file round-trip and `BRepBndLib`. manifold-3d provides direct mesh bbox via `getBoundingBox()` with no STEP round-trip.)
(Migration: bbox is now obtained from manifold-3d `getBoundingBox(shape)` directly. The `dimensional_check` field in `inspectCadModel` uses mesh bbox, not B-rep bbox.)

### STEP-based inspection round-trip

(Reason: The current spec describes bbox extraction from STEP files via `STEPControl_Reader`. In manifold-3d, inspection operates on the in-memory mesh with no file round-trip.)
(Migration: `inspectCadModel` receives the manifold shape directly. Fallback to disk-based inspection is not needed for manifold-3d, since shapes are always in-memory.)
