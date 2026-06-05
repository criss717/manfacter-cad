# cad-repair-loop

Defines the repair loop process, including the 13-attempt retry logic, tool result truncation on retry to optimize token usage, and session-local code re-hydration via model_id.

## Requirements

### Tool result truncation on retry

The `run_cad_code` tool result SHALL include a `model_id` field and the `inspect_geometry` tool result SHALL be truncated on retry attempts to reduce token consumption in the 13-attempt loop.

#### Scenario: Full inspection on first attempt

**Given** the agent calls `run_cad_code` successfully on attempt 1
**When** the agent calls `inspect_geometry` with the resulting step_path
**Then** the full inspection output SHALL be returned, including bbox, faces, edges, solids, and size

#### Scenario: Truncated inspection on retry

**Given** the agent has called `inspect_geometry` at least once in the current repair loop
**When** the agent calls `inspect_geometry` again on a retry attempt (attempt > 1)
**Then** the response SHALL be truncated to bounding box dimensions and solid count only
**And** face and edge counts SHALL be omitted

#### Scenario: model_id in tool result

**Given** the agent calls `run_cad_code` with valid build123d Python code
**When** the generation completes (success or failure)
**Then** the result SHALL include a `model_id` field containing a unique 12-character hex identifier
**And** the `model_id` SHALL be consistent across retries for the same user request

---

### Code re-hydration via session map

The agent server SHALL store generated code in a session-local map keyed by `model_id` and SHALL re-hydrate code from this map on retry instead of including the full code in the message.

#### Scenario: Code stored in session map

**Given** the agent calls `run_cad_code` with build123d Python code
**When** the generation completes
**Then** the server SHALL store the code in a session-local map under the returned `model_id`
**And** the full code SHALL NOT be included in the agent event payload sent to the LLM

#### Scenario: Code re-hydrated on retry

**Given** a previous `run_cad_code` call stored code under `model_id` "abc123def456"
**When** the LLM references `model_id` "abc123def456" in a retry context
**Then** the server SHALL retrieve the code from the session map
**And** the `read_reference` tool SHALL allow reading `{model_id}/_script.py` for the current session

---

### Snapshot mandate for COMPLEX tier

The `make_snapshot` tool SHALL be mandatory for COMPLEX-tier parts after successful generation. The prompt SHALL instruct the agent to call `make_snapshot` immediately after `inspect_geometry` for COMPLEX parts.

#### Scenario: Snapshot required for COMPLEX

**Given** a part is classified as COMPLEX tier
**When** `run_cad_code` succeeds and `inspect_geometry` returns valid facts
**Then** the agent SHALL call `make_snapshot(step_path)` before reporting to the user
**And** the prompt SHALL contain a `MANDATORY_SNAPSHOT` directive keyed to the COMPLEX tier

#### Scenario: Snapshot optional for SIMPLE and MODERATE

**Given** a part is classified as SIMPLE or MODERATE tier
**When** `run_cad_code` succeeds
**Then** the agent MAY skip `make_snapshot` unless visual ambiguity is detected
**And** the prompt SHALL NOT require `make_snapshot` for these tiers

---

### 13-attempt preservation

The maximum 13-attempt limit SHALL remain unchanged. The repair loop logic SHALL NOT reduce the maximum number of retries.

#### Scenario: Max attempts unchanged

**Given** the agent is in a repair loop
**When** the attempt counter reaches 13
**Then** the agent SHALL stop and report failure to the user
**And** the `MAX_CAD_ATTEMPTS` constant SHALL remain 13

#### Scenario: Attempt counter reset per user message

**Given** a new user message arrives in the session
**When** the server starts processing the message
**Then** `_attempt_counts[sid]` SHALL be reset to 0
**And** the full 13-attempt budget SHALL be available
