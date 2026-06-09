# Example: Planetary Gear System (build123d)

This example demonstrates how to build complex assemblies with gears using build123d.

## Key patterns shown
- External gear with teeth
- Internal gear (ring gear) with inward teeth
- Multi-body assembly using Compound()
- Pattern positioning for planets
- Connecting plates and pins

## Full code

```python
import math
from build123d import *

def make_external_gear(N, module, face_width, hole_radius=0.0):
    pitch_r = N * module / 2.0
    root_r = pitch_r - 1.25 * module
    addendum = module
    dedendum = 1.25 * module
    tooth_w = math.pi * module / 2.0
    tooth_tip_w = tooth_w * 0.4
    
    with BuildPart() as gear:
        with BuildSketch() as base_sk:
            Circle(root_r)
        extrude(amount=face_width)
        
        for i in range(int(N)):
            angle = 360.0 * i / N
            with BuildSketch(Plane.XY * Location((0,0,0), (0,0,angle))) as tooth_sk:
                with BuildLine() as tooth_ln:
                    hw = tooth_w / 2.0
                    tw = tooth_tip_w / 2.0
                    r_in = pitch_r - dedendum - 0.5
                    r_out = pitch_r + addendum
                    Polyline(
                        (r_in, -hw),
                        (r_out, -tw),
                        (r_out, tw),
                        (r_in, hw),
                        close=True
                    )
                make_face()
            extrude(amount=face_width, mode=Mode.ADD)
            
    return gear.part

def make_internal_gear(N, module, face_width):
    pitch_r = N * module / 2.0
    addendum = module
    dedendum = 1.25 * module
    tooth_w = math.pi * module / 2.0
    tooth_tip_w = tooth_w * 0.4
    ring_outer_r = pitch_r + dedendum + 8.0
    
    with BuildPart() as ring:
        with BuildSketch() as ring_sk:
            Circle(ring_outer_r)
        extrude(amount=face_width)
        
        inner_bore_r = pitch_r + dedendum
        bore_tool = Cylinder(
            radius=inner_bore_r,
            height=face_width + 2.0,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
        ring.part -= bore_tool.moved(Location((0, 0, face_width / 2.0)))
        
        for i in range(int(N)):
            angle = 360.0 * i / N
            with BuildSketch(Plane.XY * Location((0,0,0), (0,0,angle))) as tsk:
                with BuildLine() as tln:
                    hw = tooth_w / 2.0
                    tw = tooth_tip_w / 2.0
                    r_in = pitch_r + dedendum + 0.5
                    r_out = pitch_r - addendum
                    Polyline(
                        (r_in, -hw),
                        (r_out, -tw),
                        (r_out, tw),
                        (r_in, hw),
                        close=True
                    )
                make_face()
            extrude(amount=face_width, mode=Mode.ADD)
            
    return ring.part

def gen_step():
    m = 2.0
    face_width = 10.0
    pin_r = 5.0
    carrier_thickness = 5.0
    
    N_s = 18
    N_p = 24
    N_r = 66
    
    R_s = N_s * m / 2.0
    R_p = N_p * m / 2.0
    carrier_r = R_s + R_p
    
    # Sun gear
    sun = make_external_gear(N_s, m, face_width, hole_radius=pin_r)
    
    # Planet gears
    planets = []
    for i in range(3):
        angle_deg = i * 120.0
        angle_rad = math.radians(angle_deg)
        x = carrier_r * math.cos(angle_rad)
        y = carrier_r * math.sin(angle_rad)
        
        p_gear = make_external_gear(N_p, m, face_width, hole_radius=pin_r)
        p_gear = p_gear.moved(Location((x, y, 0), (0, 0, angle_deg + 7.5)))
        planets.append(p_gear)
        
    # Ring gear
    ring = make_internal_gear(N_r, m, face_width)
    
    # Carrier assembly
    carrier_z = -(carrier_thickness + 1.0)
    carrier = Cylinder(radius=15.0, height=carrier_thickness, 
                       align=(Align.CENTER, Align.CENTER, Align.MIN))
    
    for i in range(3):
        angle_rad = math.radians(i * 120.0)
        x = carrier_r * math.cos(angle_rad)
        y = carrier_r * math.sin(angle_rad)
        lobe = Cylinder(radius=12.0, height=carrier_thickness, 
                       align=(Align.CENTER, Align.CENTER, Align.MIN))
        carrier = carrier + lobe.moved(Location((x, y, 0)))
    
    # Triangular connecting plate
    pts = []
    for i in range(3):
        angle_rad = math.radians(i * 120.0)
        x = carrier_r * math.cos(angle_rad)
        y = carrier_r * math.sin(angle_rad)
        pts.append((x, y))
    
    with BuildSketch() as tri_sk:
        with BuildLine() as tri_ln:
            Polyline(pts, close=True)
        make_face()
    tri_plate = extrude(tri_sk.sketch, amount=carrier_thickness)
    carrier = carrier + tri_plate
    
    # Subtract holes
    hole_tool = Cylinder(radius=pin_r, height=carrier_thickness + 2.0, 
                         align=(Align.CENTER, Align.CENTER, Align.CENTER))
    carrier = carrier - hole_tool.moved(Location((0, 0, carrier_thickness / 2.0)))
    
    for i in range(3):
        angle_rad = math.radians(i * 120.0)
        x = carrier_r * math.cos(angle_rad)
        y = carrier_r * math.sin(angle_rad)
        carrier = carrier - hole_tool.moved(Location((x, y, carrier_thickness / 2.0)))
    
    carrier = carrier.moved(Location((0, 0, carrier_z)))
    
    # Assembly
    assembly = Compound(children=[sun, ring, carrier] + planets)
    return assembly
```

## Critical patterns
1. **Gear module math**: pitch_r = N * module / 2, root_r = pitch_r - 1.25 * module
2. **Tooth profile**: Polyline with 4 points forming a trapezoid
3. **Polar array**: Rotate each tooth with `Rot(Z=angle)` where `angle = 360 * i / N`
4. **Compound assembly**: `Compound(children=[part1, part2, ...])` for multi-body
5. **Boolean union**: `carrier = carrier + lobe` for adding material
6. **Boolean subtract**: `carrier = carrier - hole_tool` for removing material
7. **int() around variables**: `range(int(N))` for tooth count
8. **Named dimensions**: all parameters as variables at top
