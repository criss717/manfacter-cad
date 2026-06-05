"""Binary STL writer fed from cached numpy arrays (Epic B).

Produces output equivalent to ``StlAPI_Writer`` in binary mode but skips
the second ``BRepMesh_IncrementalMesh`` pass that the OCP writer performs
internally. Consumers must supply mesh arrays already in millimetre
units; geometry is preserved verbatim (no recentering, no scaling).

Binary STL layout (little-endian)::

    0x00 .. 0x4F   80-byte header (writer signature padded with NULs)
    0x50 .. 0x53   uint32 triangle count
    0x54 .. EOF    per-triangle records (50 bytes each):
                       12x float32  : normal (3) + v0 (3) + v1 (3) + v2 (3)
                       uint16       : attribute byte count (always 0)
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

_HEADER_SIGNATURE: bytes = b"manfacter-cad binary STL (Epic B)"
_STL_TRIANGLE_DTYPE = np.dtype([
    ("normal", "<f4", (3,)),
    ("v0", "<f4", (3,)),
    ("v1", "<f4", (3,)),
    ("v2", "<f4", (3,)),
    ("attr", "<u2"),
])


def _compute_face_normals(v0: np.ndarray, v1: np.ndarray, v2: np.ndarray) -> np.ndarray:
    edge1 = v1 - v0
    edge2 = v2 - v0
    raw = np.cross(edge1, edge2)
    lengths = np.linalg.norm(raw, axis=1)
    safe = np.where(lengths > 1e-15, lengths, 1.0)
    return (raw / safe[:, None]).astype(np.float32, copy=False)


def write_stl_binary(
    vertices: np.ndarray,
    faces: np.ndarray,
    normals: np.ndarray | None,
    path: str | Path,
) -> Path:
    """Serialize a cached mesh as a binary STL file.

    Parameters
    ----------
    vertices : (N, 3) float array of vertex positions in millimetres.
    faces    : (M, 3) integer array of vertex indices.
    normals  : (N, 3) float array of vertex normals, or ``None``. Per-face
               normals are recomputed from triangle geometry regardless,
               matching ``StlAPI_Writer`` binary output.
    path     : destination filename.
    """
    if vertices is None or faces is None:
        raise ValueError("vertices and faces are required")
    if vertices.ndim != 2 or vertices.shape[1] != 3:
        raise ValueError(f"vertices must have shape (N, 3); got {vertices.shape}")
    if faces.ndim != 2 or faces.shape[1] != 3:
        raise ValueError(f"faces must have shape (M, 3); got {faces.shape}")

    verts = np.ascontiguousarray(vertices, dtype=np.float64)
    tris = np.ascontiguousarray(faces, dtype=np.int64)
    triangle_count = int(tris.shape[0])

    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)

    header = _HEADER_SIGNATURE.ljust(80, b"\x00")[:80]

    if triangle_count == 0:
        with output.open("wb") as fh:
            fh.write(header)
            fh.write(np.uint32(0).tobytes())
        return output

    if tris.min() < 0 or tris.max() >= verts.shape[0]:
        raise ValueError("faces reference out-of-range vertex indices")

    v0 = verts[tris[:, 0]].astype(np.float32, copy=False)
    v1 = verts[tris[:, 1]].astype(np.float32, copy=False)
    v2 = verts[tris[:, 2]].astype(np.float32, copy=False)

    face_normals = _compute_face_normals(v0, v1, v2)

    records = np.empty(triangle_count, dtype=_STL_TRIANGLE_DTYPE)
    records["normal"] = face_normals
    records["v0"] = v0
    records["v1"] = v1
    records["v2"] = v2
    records["attr"] = 0

    with output.open("wb") as fh:
        fh.write(header)
        fh.write(np.uint32(triangle_count).tobytes())
        fh.write(records.tobytes())

    return output


__all__ = ["write_stl_binary"]
