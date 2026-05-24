"""
GLB export - glTF 2.0 binary from OpenCASCADE mesh.
"""

import struct
import json
from pathlib import Path


def _extract_mesh_data(shape) -> dict:
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.BRep import BRep_Tool
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopoDS import TopoDS

    if hasattr(shape, "wrapped"):
        topods = shape.wrapped
    else:
        topods = shape

    mesh = BRepMesh_IncrementalMesh(topods, 0.1, False, 0.5, True)
    mesh.Perform()

    positions = []
    indices = []
    vertex_offset = 0

    explorer = TopExp_Explorer(topods, TopAbs_FACE)
    while explorer.More():
        face = TopoDS.Face_s(explorer.Current())
        loc = face.Location()

        try:
            triangulation = BRep_Tool.Triangulation_s(face, loc)
            if triangulation.NbNodes() == 0:
                explorer.Next()
                continue
        except Exception:
            explorer.Next()
            continue

        trsf = loc.Transformation()
        nodes = triangulation.NbNodes()
        for i in range(1, nodes + 1):
            node = triangulation.Node(i)
            p = node.Transformed(trsf)
            positions.extend([p.X(), p.Y(), p.Z()])

        triangles = triangulation.NbTriangles()
        for i in range(1, triangles + 1):
            tri = triangulation.Triangle(i)
            indices.append(tri.Value(1) - 1 + vertex_offset)
            indices.append(tri.Value(2) - 1 + vertex_offset)
            indices.append(tri.Value(3) - 1 + vertex_offset)

        vertex_offset += nodes
        explorer.Next()

    return {"positions": positions, "indices": indices}


def _build_glb(positions: list, indices: list) -> bytes:
    if len(positions) < 3:
        return b""

    pos_bytes = struct.pack(f"<{len(positions)}f", *positions)
    max_idx = max(indices) if indices else 0

    if max_idx > 65535:
        component_type = 5125
        idx_bytes = struct.pack(f"<{len(indices)}I", *indices)
    else:
        component_type = 5123
        idx_bytes = struct.pack(f"<{len(indices)}H", *indices)

    ppad = (4 - len(pos_bytes) % 4) % 4
    ipad = (4 - len(idx_bytes) % 4) % 4
    pos_aligned = pos_bytes + b"\x00" * ppad
    idx_aligned = idx_bytes + b"\x00" * ipad
    buf = pos_aligned + idx_aligned

    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    for i in range(0, len(positions), 3):
        for j in range(3):
            mins[j] = min(mins[j], positions[i + j])
            maxs[j] = max(maxs[j], positions[i + j])

    vcount = len(positions) // 3

    gltf = {
        "asset": {"version": "2.0", "generator": "ManfacterCAD"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{
            "primitives": [{
                "attributes": {"POSITION": 0},
                "indices": 1,
                "material": 0,
            }]
        }],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": vcount, "type": "VEC3", "min": mins, "max": maxs},
            {"bufferView": 1, "componentType": component_type, "count": len(indices), "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_aligned)},
            {"buffer": 0, "byteOffset": len(pos_aligned), "byteLength": len(idx_aligned)},
        ],
        "buffers": [{"byteLength": len(buf)}],
        "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [0.78, 0.78, 0.78, 1.0], "metallicFactor": 0.05, "roughnessFactor": 0.5}}],
    }

    json_str = json.dumps(gltf, separators=(",", ":"))
    pad = (4 - len(json_str) % 4) % 4
    json_str += " " * pad

    header = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_str) + 8 + len(buf))
    c0 = struct.pack("<II", len(json_str), 0x4E4F534A) + json_str.encode()
    c1 = struct.pack("<II", len(buf), 0x004E4942) + buf

    return header + c0 + c1


def export_glb(shape, output_path: Path) -> Path:
    mesh_data = _extract_mesh_data(shape)
    if not mesh_data["positions"]:
        raise RuntimeError("No se pudo extraer malla de la geometría")

    glb = _build_glb(mesh_data["positions"], mesh_data["indices"])
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(glb)
    return output_path
