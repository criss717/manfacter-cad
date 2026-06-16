/**
 * Stub functions for ForgeCAD API completeness.
 *
 * Fillet y chamfer usan la estrategia optimizada de ForgeCAD:
 * marco de coordenadas local + EDGE_PAD + operaciones booleanas mínimas.
 * Shell remains a stub.
 */

import { Shape, type Vec3 } from './shape';
import { TrackedShape, type EdgeRef } from './trackedShape';
import { box, sphere } from './primitives';
import { union, difference } from './booleans';
import { getManifold } from './engine';


/**
 * Compute the convex hull of one or more shapes.
 *
 * ForgeCAD spec requires `hull3d(s1, s2, ...)` to return a Shape
 * representing the convex hull of all inputs.
 *
 * Current implementation:
 *  - If manifold-3d provides `Manifold.hull()`, uses it for a true convex hull.
 *  - Otherwise falls back to boolean union and logs a warning.
 *
 * Single shape → returns it unchanged (no-op).
 */
export function hull3d(...shapes: Shape[]): Shape {
  if (shapes.length === 0) {
    throw new Error('hull3d requires at least one shape');
  }
  if (shapes.length === 1) return shapes[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = getManifold();

  // Try manifold-3d's native convex hull (Manifold.hull was introduced in v3.x)
  if (typeof m.Manifold.hull === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifolds = shapes.map((s) => (s as any).manifold);
    const result = m.Manifold.hull(manifolds);
    // Inherit appearance from first shape
    const { color, material } = { color: shapes[0].color, material: shapes[0].material };
    return new Shape(result, color, material);
  }

  // Fallback: union is NOT a convex hull, but it's the closest reasonable
  // approximation available without a native hull implementation.
  console.warn(
    'hull3d: convex hull not fully implemented — falling back to boolean union. ' +
    'Install manifold-3d ≥ 3.x for native hull support.'
  );
  return union(...shapes);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Rounded primitives — using hull3d with corner spheres for perfect rounding
// ---------------------------------------------------------------------------

/**
 * Create a box with all edges and corners rounded.
 *
 * Uses convex hull of 8 corner spheres → perfectly rounded box.
 * Much cleaner than per-edge fillet cylinders.
 *
 * @param x, y, z  Box dimensions
 * @param radius   Rounding radius (default: 0 = sharp box)
 */
export function roundedBox(x: number, y: number, z: number, radius: number = 0): Shape {
  if (radius <= 0) return box(x, y, z);
  const r = radius;
  const hw = x / 2, hd = y / 2, hh = z / 2;
  // 8 corner spheres, inset by radius from each face
  const corners = [
    sphere(r).translate(-hw + r, -hd + r, r),         // bottom-left-front
    sphere(r).translate( hw - r, -hd + r, r),         // bottom-right-front
    sphere(r).translate(-hw + r,  hd - r, r),         // bottom-left-back
    sphere(r).translate( hw - r,  hd - r, r),         // bottom-right-back
    sphere(r).translate(-hw + r, -hd + r, z - r),     // top-left-front
    sphere(r).translate( hw - r, -hd + r, z - r),     // top-right-front
    sphere(r).translate(-hw + r,  hd - r, z - r),     // top-left-back
    sphere(r).translate( hw - r,  hd - r, z - r),     // top-right-back
  ];
  return hull3d(...corners);
}

/**
 * Tolerancia de extensión para evitar caras coplanares en operaciones booleanas.
 * Extender la herramienta de redondeo/chaflán más allá de los límites exactos
 * de la arista elimina errores de precisión flotante en manifold-3d.
 */
const EDGE_PAD = 0.01;

/**
 * Construye la matriz 4×4 (column-major) que transforma desde coordenadas locales
 * de la arista (basisX, basisY, edgeDir) al espacio global, con origen en el
 * punto de inicio de la arista desplazado -EDGE_PAD a lo largo de la dirección.
 */
function edgeFrameMatrix(
  start: Vec3,
  axis: Vec3,
  basisX: Vec3,
  basisY: Vec3,
  originOffset: number = 0,
): number[] {
  const origin: Vec3 = [
    start[0] + axis[0] * originOffset,
    start[1] + axis[1] * originOffset,
    start[2] + axis[2] * originOffset,
  ];
  return [
    basisX[0], basisX[1], basisX[2], 0,
    basisY[0], basisY[1], basisY[2], 0,
    axis[0],   axis[1],   axis[2],   0,
    origin[0], origin[1], origin[2], 1,
  ];
}

/**
 * Calcula el marco de coordenadas local de una arista a partir de las normales
 * de las dos caras adyacentes y los extremos de la arista.
 *
 * Retorna { axis, basisX, basisY, edgeLen, isConvex } o null si la arista es degenerada.
 */
function computeEdgeFrame(
  start: Vec3,
  end: Vec3,
  n1: Vec3,
  n2: Vec3,
): { axis: Vec3; basisX: Vec3; basisY: Vec3; edgeLen: number; isConvex: boolean } | null {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const edgeLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (edgeLen < 1e-6) return null;

  const axis: Vec3 = [dx / edgeLen, dy / edgeLen, dz / edgeLen];

  // basisX: dirección perpendicular a la arista en la cara de n1 (proyección de n1 sobre el plano ⊥ a axis)
  const dotN1 = n1[0] * axis[0] + n1[1] * axis[1] + n1[2] * axis[2];
  const bxRaw: Vec3 = [n1[0] - dotN1 * axis[0], n1[1] - dotN1 * axis[1], n1[2] - dotN1 * axis[2]];
  const bxLen = Math.sqrt(bxRaw[0] ** 2 + bxRaw[1] ** 2 + bxRaw[2] ** 2);
  if (bxLen < 1e-6) return null;
  const basisX: Vec3 = [bxRaw[0] / bxLen, bxRaw[1] / bxLen, bxRaw[2] / bxLen];

  // basisY: dirección perpendicular a la arista en la cara de n2 (proyección de n2 sobre el plano ⊥ a axis)
  const dotN2 = n2[0] * axis[0] + n2[1] * axis[1] + n2[2] * axis[2];
  const byRaw: Vec3 = [n2[0] - dotN2 * axis[0], n2[1] - dotN2 * axis[1], n2[2] - dotN2 * axis[2]];
  const byLen = Math.sqrt(byRaw[0] ** 2 + byRaw[1] ** 2 + byRaw[2] ** 2);
  if (byLen < 1e-6) return null;
  const basisY: Vec3 = [byRaw[0] / byLen, byRaw[1] / byLen, byRaw[2] / byLen];

  // Convexidad: arista convexa cuando las normales divergen (dot ≤ 0)
  const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
  const isConvex = dot <= 0;

  return { axis, basisX, basisY, edgeLen, isConvex };
}

/**
 * Fillet (redondeo) de aristas usando la estrategia optimizada de ForgeCAD.
 *
 * Para aristas convexas:
 *   1. Resta un bloque cuadrado de esquina [radius × radius] a lo largo de la arista.
 *   2. Suma un cilindro de radio = radius a lo largo de la arista.
 *   → result = union(difference(base, cornerBlock), cylinder)
 *   → Solo 2 operaciones booleanas por arista.
 *
 * Para aristas cóncavas:
 *   1. Suma directamente el cilindro de relleno.
 *   → result = union(base, cylinder)
 *   → Solo 1 operación booleana por arista.
 *
 * Usa EDGE_PAD para extender las herramientas más allá de los extremos exactos
 * de la arista, evitando caras coplanares que desestabilizan manifold-3d.
 */
export function fillet(shape: Shape, radius: number, edges?: unknown): Shape {
  if (!(shape instanceof TrackedShape)) {
    console.warn('fillet() requires TrackedShape. Apply BEFORE union/difference.');
    return shape;
  }
  if (radius <= 0) return shape;

  // Resolve edges parameter: string, string[], EdgeRef[], or undefined (all edges)
  let edgeRefs: EdgeRef[];

  if (edges === undefined) {
    // Use all named edges
    edgeRefs = [];
    for (const name of shape.edgeNames()) {
      try { edgeRefs.push(shape.edge(name)); } catch {}
    }
  } else if (typeof edges === 'string') {
    edgeRefs = [];
    try { edgeRefs.push(shape.edge(edges)); } catch {}
  } else if (Array.isArray(edges)) {
    if (edges.length === 0) {
      // Empty array → use all edges
      edgeRefs = [];
      for (const name of shape.edgeNames()) {
        try { edgeRefs.push(shape.edge(name)); } catch {}
      }
    } else if (typeof edges[0] === 'string') {
      edgeRefs = [];
      for (const name of (edges as string[])) {
        try { edgeRefs.push(shape.edge(name)); } catch {}
      }
    } else {
      // Assume EdgeRef[]
      edgeRefs = edges as EdgeRef[];
    }
  } else {
    throw new Error('fillet(): invalid edges parameter. Use a string, string[], or EdgeRef[] from edgesOf()/selectEdges().');
  }

  if (edgeRefs.length === 0) {
    const facesList = shape instanceof TrackedShape ? shape.faceNames().join(', ') : 'none';
    throw new Error(
      `fillet(): no edges found (faces: ${facesList}). ` +
      `Use edgesOf('faceName') or selectEdges(shape, { convex: true }) to select edges. ` +
      `Example: fillet(box(50,20,4), 4, edgesOf(box, 'top'))`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = getManifold();
  let result: Shape = shape;
  const segments = 16;

  for (const eref of edgeRefs) {
    try {
      if (!eref?.faceNormals) continue;

      const frame = computeEdgeFrame(eref.start, eref.end, eref.faceNormals[0], eref.faceNormals[1]);
      if (!frame) continue;

      const { axis, basisX, basisY, edgeLen, isConvex } = frame;

      // Guard: radio demasiado grande
      if (radius * 2 > edgeLen && edgeLen > 1e-6) {
        console.warn(`fillet: radius ${radius} too large for edge '${eref.name}' (length ${edgeLen.toFixed(2)}), skipping`);
        continue;
      }

      // Extensión de la herramienta con padding para evitar superficies coplanares
      const span = edgeLen + EDGE_PAD * 2;
      const mat = edgeFrameMatrix(eref.start, axis, basisX, basisY, -EDGE_PAD);

      if (isConvex) {
        // Arista convexa: restar esquina cuadrada + sumar cilindro
        // La esquina cuadrada se posiciona en el cuadrante positivo (basisX+, basisY+)
        // que corresponde al material sólido que sobra en la esquina.
        const corner = m.CrossSection.square([radius, radius], false)
          .extrude(span, 0, 0, undefined, false)
          .transform(mat);

        const cyl = m.CrossSection.circle(radius, Math.max(3, segments))
          .extrude(span, 0, 0, undefined, false)
          .transform(mat);

        try {
          const base = (result as any).manifold;
          const cut = m.Manifold.difference([base, corner]);
          const joined = m.Manifold.union([cut, cyl]);
          result = new Shape(joined, result.color, result.material);
        } catch {
          console.warn(`fillet: boolean operation failed for convex edge '${eref.name}', skipping`);
        }
      } else {
        // Arista cóncava: sumar cilindro de relleno en el cuadrante negativo
        // Se desplaza el cilindro hacia el interior del hueco cóncavo
        const cyl = m.CrossSection.circle(radius, Math.max(3, segments))
          .translate(-radius, -radius)
          .extrude(span, 0, 0, undefined, false)
          .transform(mat);

        try {
          const base = (result as any).manifold;
          const joined = m.Manifold.union([base, cyl]);
          result = new Shape(joined, result.color, result.material);
        } catch {
          console.warn(`fillet: boolean operation failed for concave edge '${eref.name}', skipping`);
        }
      }
    } catch {
      // Edge not found — skip
    }
  }
  return result;
}

/**
 * Chamfer (chaflán/bisel) de aristas usando prisma triangular con padding.
 *
 * Para aristas convexas:
 *   Resta un prisma triangular [(0,0), (d,0), (0,d)] del sólido.
 *   → result = difference(base, prism)
 *
 * Para aristas cóncavas:
 *   Suma un prisma triangular de relleno.
 *   → result = union(base, prism)
 *
 * Usa EDGE_PAD para estabilidad booleana.
 */
export function chamfer(shape: Shape, distance: number, edges?: unknown): Shape {
  if (!(shape instanceof TrackedShape)) {
    console.warn('chamfer() requires a TrackedShape with named edges. Use box() or cylinder() as base.');
    return shape;
  }

  // Resolve edges parameter: string, string[], EdgeRef[], or undefined (all edges)
  let edgeRefs: EdgeRef[];

  if (edges === undefined) {
    edgeRefs = [];
    for (const name of shape.edgeNames()) {
      try { edgeRefs.push(shape.edge(name)); } catch {}
    }
  } else if (typeof edges === 'string') {
    edgeRefs = [];
    try { edgeRefs.push(shape.edge(edges)); } catch {}
  } else if (Array.isArray(edges)) {
    if (edges.length === 0) {
      edgeRefs = [];
      for (const name of shape.edgeNames()) {
        try { edgeRefs.push(shape.edge(name)); } catch {}
      }
    } else if (typeof edges[0] === 'string') {
      edgeRefs = [];
      for (const name of (edges as string[])) {
        try { edgeRefs.push(shape.edge(name)); } catch {}
      }
    } else {
      edgeRefs = edges as EdgeRef[];
    }
  } else {
    throw new Error('chamfer(): invalid edges parameter. Use a string, string[], or EdgeRef[] from edgesOf()/selectEdges().');
  }

  if (edgeRefs.length === 0) {
    const facesList = shape instanceof TrackedShape ? shape.faceNames().join(', ') : 'none';
    throw new Error(
      `chamfer(): no edges found (faces: ${facesList}). ` +
      `Use edgesOf('faceName') or selectEdges(shape, { convex: true }) to select edges. ` +
      `Example: chamfer(box(50,20,4), 2, edgesOf(box, 'top'))`
    );
  }

  let result = shape as Shape;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = getManifold();

  for (const eref of edgeRefs) {
    try {
      if (!eref?.faceNormals) continue;

      const frame = computeEdgeFrame(eref.start, eref.end, eref.faceNormals[0], eref.faceNormals[1]);
      if (!frame) continue;

      const { axis, basisX, basisY, edgeLen, isConvex } = frame;

      if (distance > edgeLen) {
        console.warn(`chamfer: distance ${distance} exceeds edge length ${edgeLen.toFixed(2)} on '${eref.name}', result may be imprecise`);
      }

      const d = distance;
      const span = edgeLen + EDGE_PAD * 2;
      const mat = edgeFrameMatrix(eref.start, axis, basisX, basisY, -EDGE_PAD);

      if (isConvex) {
        // Prisma triangular en el cuadrante positivo: recorta la esquina
        const triangle = new m.CrossSection([[[0, 0], [d, 0], [0, d]]]);
        const prism = triangle
          .extrude(span, 0, 0, undefined, false)
          .transform(mat);

        try {
          const base = (result as any).manifold;
          const cut = m.Manifold.difference([base, prism]);
          result = new Shape(cut, result.color, result.material);
        } catch {
          console.warn(`chamfer: boolean difference failed for convex edge '${eref.name}', skipping`);
        }
      } else {
        // Arista cóncava: rellenar con prisma triangular en el cuadrante opuesto
        const triangle = new m.CrossSection([[[0, 0], [-d, 0], [0, -d]]]);
        const prism = triangle
          .extrude(span, 0, 0, undefined, false)
          .transform(mat);

        try {
          const base = (result as any).manifold;
          const joined = m.Manifold.union([base, prism]);
          result = new Shape(joined, result.color, result.material);
        } catch {
          console.warn(`chamfer: boolean union failed for concave edge '${eref.name}', skipping`);
        }
      }
    } catch {
      // Edge not found — skip
    }
  }

  return result;
}


/**
 * Shell (hollow) a shape. STUB.
 * Delegates to `shape.shell(thickness, facesToOpen)`.
 */
export function shell(shape: Shape, thickness: number, facesToOpen?: unknown): Shape {
  return shape.shell(thickness, facesToOpen);
}

/**
 * Linear pattern — create a linear array. STUB.
 * Delegates to `shape.linearPattern(count, spacing, axis)`.
 */
export function linearPattern(
  shape: Shape,
  count: number,
  spacing: number,
  axis?: Vec3,
): Shape {
  return shape.linearPattern(count, spacing, axis);
}

/**
 * Circular pattern — create a circular array. STUB.
 * Delegates to `shape.circularPattern(count, angle, axis)`.
 */
export function circularPattern(
  shape: Shape,
  count: number,
  angle: number,
  axis?: Vec3,
): Shape {
  return shape.circularPattern(count, angle, axis);
}