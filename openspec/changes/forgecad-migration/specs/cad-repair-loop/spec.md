# Delta for cad-repair-loop

## ADDED Requirements

### Proactive inspection loop

The agent MUST run inspectCadModel automatically after every runCadCode call. The agent SHALL NOT rely on reactive error-classification-and-retry — instead, inspection results drive the correction loop.

#### Scenario: Auto-inspect after code generation

- GIVEN runCadCode completes successfully
- WHEN the tool result is processed
- THEN inspectCadModel SHALL be called automatically
- AND inspection results SHALL be included in the next agent context

#### Scenario: Collision triggers correction

- GIVEN inspectCadModel returns collisionCount > 0
- WHEN the agent receives the inspection result
- THEN the agent SHALL correct the geometry based on collision data
- AND the correction SHALL NOT wait for a build123d error code

#### Scenario: Dimensional mismatch triggers correction

- GIVEN inspectCadModel returns bbox deviating > 20% from expected dimensions
- WHEN the agent receives the inspection result
- THEN the agent SHALL correct the dimensions
- AND the mismatch SHALL count as one correction iteration

### Inspection-based correction budget

The agent SHALL allow a maximum of 10 correction iterations (tool call + inspect cycles) per user request. Each runCadCode + inspectCadModel pair SHALL count as one iteration.

#### Scenario: Correction iteration counted

- GIVEN the agent calls runCadCode then inspectCadModel
- WHEN the cycle completes
- THEN the iteration counter SHALL increment by 1

#### Scenario: Iteration budget exhausted

- GIVEN 10 correction iterations have been consumed
- WHEN the agent would attempt another correction
- THEN the agent SHALL stop and report the last result to the user
- AND the remaining geometry issues SHALL be listed

### Acceptance criteria check

Before accepting a generated model as final, the agent MUST check: collisionCount = 0, dimensional accuracy within 20% per-axis, volume consistency (non-zero, reasonable for dimensions).

#### Scenario: All criteria pass

- GIVEN collisionCount = 0, dimensions within 5%, volume > 0
- WHEN the agent evaluates acceptance
- THEN the model SHALL be accepted
- AND the result SHALL be returned to the user

#### Scenario: Criteria partially fail

- GIVEN collisionCount = 3, dimensions within 10%
- WHEN the agent evaluates acceptance
- THEN the model SHALL be rejected
- AND the agent SHALL attempt correction focused on collision resolution

## MODIFIED Requirements

### Tool result truncation on retry

The `runCadCode` tool result SHALL include a `model_id` field. The `inspectCadModel` result SHALL be truncated on correction iterations > 1 to reduce token consumption.
(Previously: truncation on retry attempts in 13-attempt loop)

#### Scenario: Full inspection on first iteration

- GIVEN the agent calls inspectCadModel on the first iteration
- WHEN the inspection runs
- THEN full details SHALL be returned: bbox, volume, collision count, surface area, triangle count, auto-generated snapshot

#### Scenario: Truncated inspection on subsequent iterations

- GIVEN the agent has called inspectCadModel at least once in the current correction loop
- WHEN inspectCadModel is called on iteration > 1
- THEN the response SHALL be truncated to: bbox dimensions, collision count, volume
- AND surface area and triangle count SHALL be omitted

### Snapshot mandate for COMPLEX tier

The agent SHALL render a snapshot for COMPLEX-tier parts after generation. The prompt SHALL instruct the agent to call renderPNG immediately after inspectCadModel for COMPLEX parts.

#### Scenario: Snapshot required for COMPLEX

- GIVEN a part is classified as COMPLEX tier
- WHEN runCadCode succeeds and inspectCadModel returns valid facts
- THEN the agent SHALL call renderPNG before reporting to the user
- AND the prompt SHALL contain a `MANDATORY_SNAPSHOT` directive keyed to the COMPLEX tier

#### Scenario: Snapshot optional for SIMPLE and MODERATE

- GIVEN a part is classified as SIMPLE or MODERATE tier
- WHEN runCadCode succeeds
- THEN the agent MAY skip renderPNG unless visual ambiguity is detected

### 10-iteration preservation

The maximum 10-iteration correction limit SHALL be enforced. The agent SHALL NOT exceed 10 runCadCode + inspect cycles per user request.

#### Scenario: Max iterations enforced

- GIVEN the agent is in a correction loop
- WHEN the iteration counter reaches 10
- THEN the agent SHALL stop and report status to the user
- AND `MAX_CAD_CORRECTIONS` SHALL be 10

#### Scenario: Iteration counter reset per user message

- GIVEN a new user message arrives in the session
- WHEN the agent starts processing the message
- THEN the correction counter SHALL be reset to 0

## REMOVED Requirements

### 13-attempt preservation

(Reason: proactive inspection loop replaces the reactive error-classification retry loop. Correction cap is now 10 iterations, driven by inspection results rather than error codes.)
(Migration: cad-agent-ts implements the proactive loop. The 13-attempt constant is replaced by `MAX_CAD_CORRECTIONS = 10`.)
