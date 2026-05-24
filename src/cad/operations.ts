import { getWasm, getManifold, type ManifoldShape } from "./kernel";
import type { Manifold } from "manifold-3d";

function manifoldFromShapes(shapes: ManifoldShape[]): Manifold[] {
  return shapes.map(getManifold);
}

export function union(shapes: ManifoldShape[]): ManifoldShape {
  const w = getWasm();
  const ms = manifoldFromShapes(shapes);
  let result = ms[0];
  for (let i = 1; i < ms.length; i++) {
    result = result.add(ms[i]);
  }
  return { _manifold: result };
}

export function difference(
  base: ManifoldShape,
  cutters: ManifoldShape[]
): ManifoldShape {
  const w = getWasm();
  let result = getManifold(base);
  for (const cutter of cutters) {
    result = result.subtract(getManifold(cutter));
  }
  return { _manifold: result };
}

export function intersection(shapes: ManifoldShape[]): ManifoldShape {
  const w = getWasm();
  const ms = manifoldFromShapes(shapes);
  let result = ms[0];
  for (let i = 1; i < ms.length; i++) {
    result = result.intersect(ms[i]);
  }
  return { _manifold: result };
}
