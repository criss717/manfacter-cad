# Delta for cad-gear-generation

## MODIFIED Requirements

### Requirement: Involute Spur Gear

The system SHALL implement `gear(module, teeth, faceWidth, pressureAngle?)` using a correct involute tooth profile generated from `involutePoints`. The tooth SHALL be constructed as a CrossSection, extruded to `faceWidth`, and replicated via `circularPattern`. Pitch diameter SHALL equal `module × teeth`. Tip arc target angle SHALL be `-(invAtTip - rotOffset)`; root radial angles SHALL be `±rotOffset`. The tooth polygon SHALL be strictly convex and closed.
(Previously: Manual broken polygon math, involutePoints existed but was unused)

#### Scenario: Standard spur gear

- GIVEN `gear(2, 20, 10)` (module 2, 20 teeth, 10mm face width)
- THEN 20 teeth are produced with pitch diameter = 40
- AND `numTri()` is reasonable (< 5000)
- AND `volume()` matches expected gear volume

#### Scenario: Custom pressure angle

- GIVEN `gear(2, 20, 10, 14.5)`
- THEN teeth use 14.5° pressure angle involute profile
- AND tooth shape differs from default 20° gear

#### Scenario: Invalid module

- GIVEN `gear(0, 20, 10)` or `gear(-1, 20, 10)`
- THEN throw "module must be > 0"

#### Scenario: Invalid tooth count

- GIVEN `gear(2, 3, 10)` or `gear(2, 7, 10)`
- THEN throw "teeth must be ≥ 8"

#### Scenario: Invalid face width

- GIVEN `gear(2, 20, 0)` or `gear(2, 20, -5)`
- THEN throw "faceWidth must be > 0"

#### Scenario: Pressure angle out of range

- GIVEN `gear(2, 20, 10, 10)` or `gear(2, 20, 10, 35)`
- THEN throw "pressureAngle must be between 14.5° and 30°"

### Requirement: Internal Ring Gear

The system SHALL implement `internalGear(module, teeth, faceWidth)` as a ring gear with inward-facing involute teeth. The inner diameter SHALL equal `module × teeth`. The tooth profile SHALL be the corrected involute mirrored inward so teeth point toward the center.
(Previously: Broken manual polygon, teeth not properly inward-facing)

#### Scenario: Standard ring gear

- GIVEN `internalGear(2, 40, 10)`
- THEN 40 internal teeth are produced with inner diameter = 80
- AND teeth point inward toward the center
- AND the outer ring is solid material

#### Scenario: Invalid internal gear parameters

- GIVEN `internalGear(0, 40, 10)` or `internalGear(2, 3, 10)`
- THEN throw appropriate validation error (same as spur gear)

### Requirement: Helical Gear Stub

The system SHALL provide `helicalGear(...)` as a stub that logs a warning and returns a spur gear equivalent.
(Previously: Not specified)

#### Scenario: Helical gear called

- GIVEN `helicalGear(2, 20, 10, 30)`
- THEN a warning is logged that helical gear is not implemented
- AND a spur gear `gear(2, 20, 10)` is returned as fallback
