# face-picking

Interactive face selection in the 3D viewer via raycasting and OCP face matching for LLM-driven CAD editing.

## Requirements

| # | Requirement | Strength |
|---|------------|----------|
| R1 | Face Picker Toggle | MUST |
| R2 | Face Selection via Click | MUST |
| R3 | Empty Space Click | MUST |
| R4 | OCP Face Matching | MUST |
| R5 | Face Highlight | MUST |
| R6 | Face Context in Commands | MUST |

### R1: Face Picker Toggle
The system MUST provide a toggle button to activate/deactivate face picking mode.

#### Scenario: Toggle ON
- GIVEN face picker is OFF
- WHEN user clicks the toggle
- THEN face picker activates and shows active state

#### Scenario: Toggle OFF clears highlight
- GIVEN face picker is ON with a highlighted face
- WHEN user clicks the toggle
- THEN face picker deactivates and highlight clears

### R2: Face Selection via Click
When active, clicking a model face MUST trigger raycasting and send hit point + surface normal to the backend via WebSocket `face_pick` message.

#### Scenario: Face clicked sends pick message
- GIVEN face picker ON and model loaded
- WHEN user clicks a visible face
- THEN raycast captures world-space hit point and normal
- AND both are sent to backend via WebSocket `face_pick`

### R3: Empty Space Click
Clicking empty space when face picker is active MUST do nothing — no WebSocket message, no error, no toast.

#### Scenario: Empty space ignored
- GIVEN face picker ON and model loaded
- WHEN user clicks empty space (no geometry intersected)
- THEN no WebSocket message is sent
- AND no error or toast is displayed

### R4: OCP Face Matching
The backend MUST match the hit point + normal against OCP faces using `TopExp_Explorer` and `BRep_Tool.Triangulation`, returning the closest face identity.

#### Scenario: Single face matched
- GIVEN a `face_pick` message with hit point and normal
- WHEN backend iterates OCP faces
- THEN the closest face selector expression is returned to frontend

#### Scenario: Ambiguous match returns candidates
- GIVEN multiple faces within tolerance of the hit point
- WHEN backend matches faces
- THEN candidates with confidence scores are returned
- AND the LLM MAY use `sort_by` selectors to disambiguate

### R5: Face Highlight
The frontend MUST highlight the matched face and store its identity in application state.

#### Scenario: Face highlighted on match
- GIVEN a valid face identity response from backend
- WHEN frontend receives it
- THEN the face is visually highlighted (color change)
- AND face identity is stored in Zustand state

#### Scenario: Highlight cleared on toggle OFF
- GIVEN a face is highlighted
- WHEN face picker is deactivated
- THEN highlight is removed

### R6: Face Context in Commands
The selected face identity MUST be available as context for LLM commands referencing the face.

#### Scenario: Face referenced in user command
- GIVEN a face is selected and highlighted
- WHEN user types a command like "make a hole here"
- THEN the face selector expression is included in the LLM prompt context
