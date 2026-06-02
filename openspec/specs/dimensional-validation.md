# dimensional-validation

Post-export bounding box comparison between the generated STEP geometry and the user's dimensional request. Triggers auto-repair when the exported bbox deviates beyond a configured threshold.

## Requirements

### Bbox comparison against request

After every successful `run_cad_code` call, the system SHALL compare the generated model's bounding box against the dimensional expectations extracted from the user's request.

#### Scenario: Bbox matches request within tolerance

**Given** a user requests a "100x60x20 mm plate"
**And** the generated STEP has bbox dimensions 100.0 x 60.0 x 20.0 mm
**When** dimensional validation runs post-export
**Then** the check SHALL pass
**And** no repair SHALL be triggered

#### Scenario: Bbox deviates beyond 20% threshold

**Given** a user requests a "100x60x20 mm plate"
**And** the generated STEP has bbox dimensions 80.0 x 60.0 x 20.0 mm (20% off in X)
**When** dimensional validation runs post-export
**Then** the check SHALL flag the X dimension as a mismatch
**And** a repair SHALL be triggered automatically
**And** the agent SHALL receive a hint about the expected vs actual dimensions

#### Scenario: Bbox deviates within 20% threshold

**Given** a user requests a "100x60x20 mm plate"
**And** the generated STEP has bbox dimensions 95.0 x 58.0 x 21.0 mm
**When** dimensional validation runs post-export
**Then** the check SHALL pass (all dimensions within 20%)
**And** no repair SHALL be triggered

### Dimensional expectations extraction

The system SHALL parse the user's request text to extract expected dimensions (length, width, height, diameter, radius) before generation begins.

#### Scenario: Dimensions extracted from explicit mention

**Given** a user requests "a block of 50 by 30 by 10 mm"
**When** the request is parsed for dimensions
**Then** width=50, depth=30, height=10 SHALL be extracted
**And** units SHALL default to millimeters

#### Scenario: Dimensions extracted from standard part names

**Given** a user requests "an M8 bolt, 40 mm long"
**When** the request is parsed
**Then** diameter=8 (from M8), length=40 SHALL be extracted
**And** the expected bbox SHALL include the bolt head dimensions from standard tables

#### Scenario: No dimensions to validate

**Given** a user requests "a decorative gear" with no numeric dimensions
**When** the request is parsed for dimensions
**Then** no expected dimensions SHALL be stored
**And** dimensional validation SHALL be skipped for this generation
**And** the skip SHALL be logged

### Auto-repair on dimensional mismatch

When a dimension mismatch is detected, the system SHALL trigger repair by providing the actual vs expected bbox to the agent as part of the `run_cad_code` result or inspection output.

#### Scenario: Repair triggered with dimension context

**Given** dimensional validation detects a mismatch in the X axis (expected 100, got 78)
**When** the repair is triggered
**Then** the agent SHALL receive the expected dimensions alongside the mismatch report
**And** the `inspect_geometry` output SHALL include an `expected_bbox` field
**And** the mismatch SHALL count as one attempt in the 13-attempt loop

#### Scenario: Repair succeeds on second attempt

**Given** the first attempt produced a 20% X-axis mismatch
**And** the agent regenerates code with corrected dimensions
**When** the second `run_cad_code` succeeds and passes dimensional validation
**Then** the agent SHALL report success to the user
**And** the first-try failure SHALL be recorded in metrics

#### Scenario: Dimensional repair exhausts attempts

**Given** the agent has made 13 attempts and dimensional mismatch persists
**When** the 13-attempt limit is reached
**Then** the agent SHALL report the failure with the last known expected vs actual dimensions
**And** the user SHALL be informed of the specific dimension that could not be met

### Dimensional validation in inspection

The `inspect_geometry` tool SHALL incorporate the dimensional comparison when expected dimensions are available, and SHALL include the mismatch details in its output.

#### Scenario: Inspection includes dimensional check

**Given** expected dimensions were extracted from the user request
**When** `inspect_geometry` is called with a step_path
**Then** the output SHALL include a `dimensional_check` field with:
- `expected`: the parsed expected dimensions
- `actual`: the measured bbox dimensions
- `deviations`: per-axis percentage deviations
- `pass`: boolean indicating all deviations within threshold

#### Scenario: Inspection without expected dimensions

**Given** no expected dimensions were extracted from the user request
**When** `inspect_geometry` is called
**Then** the `dimensional_check` field SHALL be null or absent
**And** the remaining inspection facts SHALL be returned as normal

### Threshold configuration

The dimensional mismatch threshold SHALL be configurable and SHALL default to 20% per-axis deviation.

#### Scenario: Default 20% threshold

**Given** no custom threshold is configured
**When** dimensional validation runs
**Then** a mismatch SHALL be triggered when any axis dimension deviates ≥ 20% from expected

#### Scenario: Threshold respected for small dimensions

**Given** an expected dimension of 2.0 mm
**When** the actual dimension is 1.6 mm (20% deviation)
**Then** the mismatch SHALL be triggered
**And** the absolute deviation (0.4 mm) SHALL also be considered if a minimum absolute threshold is configured

### Metrics gate on dimensional validation efficacy

The metrics harness SHALL track the rate at which dimensional validation correctly triggers repair for off-by-≥20% bbox mismatches.

#### Scenario: Efficacy target

**Given** the last 200 runs include cases where bbox deviated ≥ 20% from request
**When** the metrics harness evaluates dimensional validation efficacy
**Then** repair SHALL have been triggered in ≥ 80% of those cases
**And** the gate SHALL fail if the trigger rate drops below 80%
