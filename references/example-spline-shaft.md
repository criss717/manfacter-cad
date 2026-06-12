# Example: Spline Shaft with Holes (build123d)

This example demonstrates advanced build123d patterns for complex mechanical parts.

## Key patterns shown
- Multi-step cylindrical body with external taper
- Internal splines (gear teeth) through the entire length
- Counterbored holes with multiple diameters
- Chamfer on edges

## Full code

```python
from build123d import *
import math

def gen_step():
    total_length = 117.0
    flange_outer_dia = 205.0
    flange_recess_dia = 150.0
    flange_thick_outer = 23.0
    flange_thick_total = 25.0
    
    body_large_dia = 140.0
    body_large_length = 38.50
    
    body_small_dia = 130.0
    
    spline_minor_dia = 74.0
    spline_major_dia = 80.3
    spline_teeth_count = 25
    spline_tooth_base_w = 6.16
    spline_tooth_tip_w = 2.45
    
    with BuildPart() as bp:
        # Base Flange layers
        Cylinder(radius=flange_outer_dia/2.0, height=flange_thick_outer, 
                 align=(Align.CENTER, Align.CENTER, Align.MIN))
        Cylinder(radius=flange_recess_dia/2.0, height=flange_thick_total, 
                 align=(Align.CENTER, Align.CENTER, Align.MIN))
        
        # External Body Step 1 (Ø140)
        with Locations((0, 0, flange_thick_total)):
            Cylinder(radius=body_large_dia/2.0, height=body_large_length, 
                     align=(Align.CENTER, Align.CENTER, Align.MIN))
            
        # External Body Step 2 (Ø130)
        with Locations((0, 0, flange_thick_total + body_large_length)):
            Cylinder(radius=body_small_dia/2.0, height=50.0, 
                     align=(Align.CENTER, Align.CENTER, Align.MIN))
            
        # External Taper (15 degrees)
        taper_length = 5.0 / math.tan(math.radians(15.0))
        with Locations((0, 0, total_length - taper_length)):
            Cone(body_small_dia/2.0, 120.0/2.0, taper_length, 
                 align=(Align.CENTER, Align.CENTER, Align.MIN))
            
        # Inner bore subtraction
        with Locations((0, 0, -0.05)):
            Cylinder(radius=spline_major_dia/2.0, height=total_length + 0.1, 
                     align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)
            
        # Spline teeth through all
        for i in range(int(spline_teeth_count)):
            angle = 360.0 * i / spline_teeth_count
            with BuildSketch(Plane.XY * Rot(0, 0, angle)) as t_sk:
                with BuildLine() as t_ln:
                    Polyline(
                        (-spline_tooth_base_w / 2.0, spline_major_dia / 2.0 + 1.0),
                        (spline_tooth_base_w / 2.0, spline_major_dia / 2.0 + 1.0),
                        (spline_tooth_tip_w / 2.0, spline_minor_dia / 2.0),
                        (-spline_tooth_tip_w / 2.0, spline_minor_dia / 2.0),
                        close=True
                    )
                make_face()
            extrude(amount=total_length, mode=Mode.ADD)
                
        # Outer ring holes
        for angle in [22.0, 112.0, 202.0, 292.0]:
            x = 90.0 * math.cos(math.radians(angle))
            y = 90.0 * math.sin(math.radians(angle))
            with Locations((x, y, -1.0)):
                Cylinder(radius=10.5 / 2.0, height=flange_thick_total + 2.0, 
                         align=(Align.CENTER, Align.CENTER, Align.MIN), mode=Mode.SUBTRACT)

        # Chamfer bottom edge
        edges_at_bottom = [e for e in bp.edges().filter_by(GeomType.CIRCLE) 
                          if math.isclose(e.center().Z, 0.0, abs_tol=1e-2)]
        bottom_outer_edge = max(edges_at_bottom, key=lambda e: e.radius)
        chamfer(bottom_outer_edge, length=2.0)

    return bp.part
```

## Critical patterns
1. **Named variables for ALL dimensions** — never hardcode numbers inline
2. **Mode.SUBTRACT** for holes, **Mode.ADD** for features
3. **BuildSketch + BuildLine + Polyline** for custom tooth profiles
4. **Rot(Z=angle)** for polar array of teeth
5. **math.isclose()** for edge selection at specific Z height
6. **int() around variables** in range(): `range(int(spline_teeth_count))`
7. **Chamfer LAST** — after all features
