"""
CAD Templates - high-level parametric shape functions.
All boxes use corner-at-origin convention (align=(Align.MIN, Align.MIN, Align.MIN)).
All cylinders grow along +Z from origin.
"""

from build123d import *


def make_box(width: float, depth: float, height: float, label: str = "") -> Solid:
    box = Box(width, depth, height, align=(Align.MIN, Align.MIN, Align.MIN))
    if label: box.label = label
    return box


def make_cylinder(radius: float, height: float, label: str = "") -> Solid:
    cyl = Cylinder(radius, height)
    if label: cyl.label = label
    return cyl


def make_sphere(radius: float, label: str = "") -> Solid:
    sphere = Sphere(radius)
    if label: sphere.label = label
    return sphere


def make_l_bracket(
    base_width: float,
    base_depth: float,
    thickness: float,
    wall_height: float,
    *,
    hole_diameter: float = 0,
    hole_positions: list[tuple[float, float]] | None = None,
    wall_hole_diameter: float = 0,
    wall_hole_positions: list[tuple[float, float]] | None = None,
    label: str = "",
) -> Solid:
    total_height = wall_height + thickness
    block = Box(base_width, base_depth, total_height, align=(Align.MIN, Align.MIN, Align.MIN))
    cutout = Box(base_width - thickness, base_depth, wall_height, align=(Align.MIN, Align.MIN, Align.MIN)).moved(
        Location((thickness, 0, thickness))
    )
    result = block - cutout

    if hole_diameter > 0 and hole_positions:
        radius = hole_diameter / 2
        for x, y in hole_positions:
            hole = Cylinder(radius, thickness + 2).moved(
                Location((x, y, -1))
            )
            result = result - hole

    if wall_hole_diameter > 0 and wall_hole_positions:
        radius = wall_hole_diameter / 2
        for y, z in wall_hole_positions:
            hole = Cylinder(radius, thickness + 2).moved(
                Location((0, y, z))
            ).rotate(Axis.Z, 90)
            hole = hole.moved(Location((base_width + 1, 0, 0)))
            result = result - hole

    result.label = label or f"Soporte L {base_width}x{base_depth}x{thickness}"
    return result


def make_plate_with_holes(
    width: float,
    depth: float,
    thickness: float,
    *,
    hole_diameter: float = 0,
    hole_positions: list[tuple[float, float]] | None = None,
    label: str = "",
) -> Solid:
    plate = Box(width, depth, thickness, align=(Align.MIN, Align.MIN, Align.MIN))

    if hole_diameter > 0 and hole_positions:
        radius = hole_diameter / 2
        for x, y in hole_positions:
            hole = Cylinder(radius, thickness + 2).moved(
                Location((x, y, -1))
            )
            plate = plate - hole

    plate.label = label or f"Placa {width}x{depth}x{thickness}"
    return plate


def make_u_bracket(
    base_width: float,
    base_depth: float,
    thickness: float,
    wall_height: float,
    *,
    hole_diameter: float = 0,
    hole_positions: list[tuple[float, float]] | None = None,
    label: str = "",
) -> Solid:
    total_height = wall_height + thickness
    block = Box(base_width, base_depth, total_height, align=(Align.MIN, Align.MIN, Align.MIN))
    cutout = Box(base_width - 2 * thickness, base_depth, wall_height, align=(Align.MIN, Align.MIN, Align.MIN)).moved(
        Location((thickness, 0, thickness))
    )
    result = block - cutout

    if hole_diameter > 0 and hole_positions:
        radius = hole_diameter / 2
        for x, y in hole_positions:
            hole = Cylinder(radius, thickness + 2).moved(
                Location((x, y, -1))
            )
            result = result - hole

    result.label = label or f"Soporte U {base_width}x{base_depth}x{thickness}"
    return result


def make_cylinder_with_hole(
    outer_radius: float,
    height: float,
    inner_radius: float,
    *,
    label: str = "",
) -> Solid:
    outer = Cylinder(outer_radius, height, align=(Align.MIN, Align.MIN, Align.MIN))
    if inner_radius > 0:
        inner = Cylinder(inner_radius, height + 2, align=(Align.MIN, Align.MIN, Align.MIN)).moved(
            Location((0, 0, -1))
        )
        outer = outer - inner
    outer.label = label or f"Cilindro r{outer_radius} h{height}"
    return outer


TEMPLATES = {
    "box": make_box,
    "cylinder": make_cylinder,
    "sphere": make_sphere,
    "l_bracket": make_l_bracket,
    "plate_with_holes": make_plate_with_holes,
    "u_bracket": make_u_bracket,
    "cylinder_with_hole": make_cylinder_with_hole,
}
