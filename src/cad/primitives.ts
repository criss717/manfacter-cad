import { getWasm, type ManifoldShape } from "./kernel";

const UNITS = { mm: 1, in: 25.4 } as const;
let currentUnit: "mm" | "in" = "mm";

export function setUnit(unit: "mm" | "in"): void {
  currentUnit = unit;
}

export function getUnit(): "mm" | "in" {
  return currentUnit;
}

export function toMM(value: number): number {
  return value * (UNITS[currentUnit] / UNITS.mm);
}

export interface PrimitiveOpts {
  center?: boolean;
  unit?: "mm" | "in";
}

export function createBox(
  width: number,
  depth: number,
  height: number,
  opts: PrimitiveOpts = {}
): ManifoldShape {
  const w = toMM(width);
  const d = toMM(depth);
  const h = toMM(height);
  return {
    _manifold: getWasm().Manifold.cube([w, d, h], opts.center ?? false),
  };
}

export function createCylinder(
  height: number,
  radius: number,
  segments: number = 64,
  opts: PrimitiveOpts = {}
): ManifoldShape {
  const w = getWasm();
  const h = toMM(height);
  const r = toMM(radius);
  return {
    _manifold: w.Manifold.cylinder(h, r, r, segments, opts.center ?? false),
  };
}

export function createSphere(
  radius: number,
  segments: number = 64
): ManifoldShape {
  const w = getWasm();
  const r = toMM(radius);
  return {
    _manifold: w.Manifold.sphere(r, segments),
  };
}
