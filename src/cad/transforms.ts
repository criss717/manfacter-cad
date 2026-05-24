import { getManifold, type ManifoldShape } from "./kernel";
import { toMM } from "./primitives";

export function translate(
  shape: ManifoldShape,
  x: number,
  y: number,
  z: number
): ManifoldShape {
  const m = getManifold(shape);
  return { _manifold: m.translate([toMM(x), toMM(y), toMM(z)]) };
}

export function rotate(
  shape: ManifoldShape,
  rx: number,
  ry: number,
  rz: number
): ManifoldShape {
  const m = getManifold(shape);
  const degToRad = (d: number) => (d * Math.PI) / 180;
  return {
    _manifold: m.rotate([
      degToRad(rx),
      degToRad(ry),
      degToRad(rz),
    ]),
  };
}

export function scale(
  shape: ManifoldShape,
  sx: number,
  sy?: number,
  sz?: number
): ManifoldShape {
  const m = getManifold(shape);
  return { _manifold: m.scale([sx, sy ?? sx, sz ?? sx]) };
}

export function mirror(
  shape: ManifoldShape,
  normal: [number, number, number]
): ManifoldShape {
  const m = getManifold(shape);
  return { _manifold: m.mirror(normal) };
}
