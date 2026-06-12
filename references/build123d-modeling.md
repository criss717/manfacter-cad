# build123d modeling patterns

Read this file when writing or repairing build123d Python source.

## Modeling objective

Create a valid STEP-ready BREP model, not a visual mesh. Prefer closed solids, explicit labels, and stable parametric dimensions.

## Topology stack

Think in this order:

```text
Vertex → Edge → Wire → Face → Shell → Solid → Compound
```

For normal STEP output, return one of:

- a valid `Solid`
- a compound of valid solids
- a labeled assembly compound

Avoid returning loose wires, open faces, or construction surfaces unless the user explicitly requested them.

## Source envelope

Generated sources should define:

```python
def gen_step():
    ...
    return shape_or_compound
```

Do not hardcode output paths inside `gen_step()`. The CLI owns output paths.

## Parameters first

Put meaningful dimensions in named variables:

```python
width = 80.0
depth = 50.0
thickness = 6.0
hole_diameter = 4.5
hole_offset_x = 30.0
hole_offset_y = 17.5
```

Avoid burying important numbers inside geometry calls.

## Coordinate system

Declare or comment the convention:

```text
Origin: center of primary part or chosen mating datum
XY: main base/sketch plane
+Z: up/extrusion direction
```

Use `Location`, `Plane`, and `Axis` intentionally. For positioning-sensitive tasks and source-level assembly relationships, read `positioning.md`.

## Builder contexts

Use the context that matches the geometry:

```python
with BuildLine() as path:
    ...

with BuildSketch() as profile:
    ...

with BuildPart() as part:
    ...
```

Typical flow:

```text
curves/paths → sketches/profiles → solids/features → labels → STEP
```

## Primitives

Use canonical primitives when they fit the design intent:

- `Box` for rectangular blocks and plates
- `Cylinder` for bosses, rods, pins, and subtractive cylindrical cuts
- `Sphere` for knobs or spherical ends
- `Torus` for rings and circular sweeps
- `Cone` for tapered features
- `Wedge` for sloped solids

Use sketches plus `extrude`, `revolve`, `sweep`, or `loft` when the shape is profile-driven.

## Feature operations

Map design intent to operations:

```text
hole              → Hole or subtractive cylinder
counterbore       → CounterBoreHole
countersink       → CounterSinkHole
slot              → slot profile + subtractive extrude
boss/standoff     → cylinder addition + central hole
rib               → extruded rectangular/triangular profile
rounded edge      → fillet
beveled edge      → chamfer
hollow enclosure  → shell or subtractive inner volume
revolved part     → revolve profile
swept tube/rail   → sweep profile along path
```

## Selection practices

Avoid fragile topology order when possible. Select by:

- axis or normal
- location or bounding position
- plane grouping
- feature intent
- stable construction plane
- inspected `@cad[...]` reference for downstream validation

For source operations, prefer robust selectors such as top/bottom by axis or position rather than arbitrary list indexes.


## Assemblies and positioning

For assemblies, keep this file focused on BREP modeling patterns and labels. Use `positioning.md` as the single source of truth for:

- part-local coordinate conventions
- when to use build123d joints versus explicit `Location` transforms
- `connect_to()` behavior
- CLI `inspect mate` as read-only validation
- frame, measure, and positioning report expectations

## Labels and assemblies

Label every exported part and assembly child:

```python
base.label = "base"
lid.label = "lid"
assembly.label = "electronics_enclosure"
```

For repeated parts, keep transforms or joint connections explicit and inspect frames/positioning after generation.

## Common failure modes

- Fillet radius larger than local edge geometry.
- Subtractive tool does not pass fully through target material.
- Open sketch profile produces invalid or missing face.
- Face selector changes after a boolean or fillet.
- Source-level assembly composition is lost by re-importing generated STEP instead of using the Python assembly source.
- Part origin is arbitrary and later mating checks become ambiguous.
- Joint labels are duplicated within the same part.
- Source-level joints are treated as if they were persistent STEP constraints rather than one-time source placement operations.
- Joint labels are missing, duplicated, or attached to the wrong local datum.
- `.connect_to()` fixes the wrong side of the relationship, moving the part intended to remain fixed.

Use `repair-loop.md` when generation or validation fails.

## Gear teeth — proven pattern

When generating gears with teeth, use this exact pattern. Do NOT use manual `+` boolean for teeth — use `BuildPart` + `extrude(mode=Mode.ADD)` which is far more reliable in build123d.

### External gear (sun, planet, spur)

```python
import math
from build123d import *

N = 20          # number of teeth (INTEGER)
module = 2.0    # mm
face_width = 10.0

pitch_r = N * module / 2.0           # pitch circle radius
root_r = pitch_r - 1.25 * module      # root circle
addendum = module
dedendum = 1.25 * module
tooth_w = math.pi * module / 2.0     # tooth width at pitch circle
tooth_tip_w = tooth_w * 0.4          # tip width (trapezoidal)

with BuildPart() as gear:
    # Root cylinder
    with BuildSketch() as base_sk:
        Circle(root_r)
    make_face()
    extrude(amount=face_width)
    
    # Teeth — use Mode.ADD, NOT manual +
    for i in range(int(N)):
        angle = 360.0 * i / N
        with BuildSketch(
            Plane.XY.offset(pitch_r).moved(Location((0, 0, 0), (0, 0, angle)))
        ) as tooth_sk:
            with BuildLine() as tooth_ln:
                hw = tooth_w / 2.0
                tw = tooth_tip_w / 2.0
                Polyline(
                    (-hw, -dedendum),
                    (hw, -dedendum),
                    (tw, addendum),
                    (-tw, addendum),
                    close=True,
                )
            make_face()
        extrude(amount=face_width, mode=Mode.ADD)

result = gear.part
```

### Internal gear (ring)

```python
# Internal ring gear — teeth point inward
ring_outer_r = (N * module / 2.0) + dedendum + 6.0  # extra wall thickness

with BuildPart() as ring:
    with BuildSketch() as ring_sk:
        Circle(ring_outer_r)
    make_face()
    extrude(amount=face_width)

    # Inner bore
    inner_bore = Cylinder(
        radius=pitch_r + addendum + 1.0,
        height=face_width + 2.0,
        align=(Align.CENTER, Align.CENTER, Align.CENTER),
    )
    ring.part -= inner_bore.moved(Location((0, 0, face_width / 2.0)))

    # Internal teeth — PROJECT toward center (inverted trapezoid)
    for i in range(int(N)):
        angle = 360.0 * i / N
        with BuildSketch(
            Plane.XY.offset(pitch_r).moved(Location((0, 0, 0), (0, 0, angle)))
        ) as tsk:
            with BuildLine() as tln:
                hw = tooth_w / 2.0
                tw = tooth_tip_w / 2.0
                Polyline(
                    (-tw, addendum),       # narrower tip (closer to center)
                    (tw, addendum),
                    (hw, -dedendum),        # wider base (at ring wall)
                    (-hw, -dedendum),
                    close=True,
                )
            make_face()
        extrude(amount=face_width, mode=Mode.ADD)

result = ring.part
```

**Critical rules for gears:**
- ALWAYS use `with BuildPart() as gear:` context manager — never create a loose Solid and boolean-add teeth
- ALWAYS use `extrude(amount=X, mode=Mode.ADD)` — never `gear = gear + tooth`
- `Plane.XY.offset(pitch_r)` places the sketch at the pitch circle — the `.moved(Location(..., (0,0,angle)))` rotates it
- Count teeth as INTEGER: `N = 18` (not 18.0), use `range(int(N))`
- For planetaries: create each gear as a separate `BuildPart`, then compose with `Compound(children=[...])`
