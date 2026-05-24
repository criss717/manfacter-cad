import { initKernel, getWasm, manifoldToMesh, type ManifoldShape } from "./kernel";
import type { Manifold, ManifoldToplevel } from "manifold-3d";

export type AnchorFace = "top" | "bottom" | "front" | "back" | "left" | "right";
export type AnchorCorner =
  | "topFrontLeft" | "topFrontRight" | "topBackLeft" | "topBackRight"
  | "bottomFrontLeft" | "bottomFrontRight" | "bottomBackLeft" | "bottomBackRight";
export type AnchorEdge =
  | "topFront" | "topBack" | "topLeft" | "topRight"
  | "bottomFront" | "bottomBack" | "bottomLeft" | "bottomRight"
  | "frontLeft" | "frontRight" | "backLeft" | "backRight";

export type Anchor3D = AnchorFace | AnchorCorner | AnchorEdge | "center";

export interface ShapeData {
  id: string;
  name: string;
  manifold?: Manifold;
  type: "primitive" | "boolean";
  primitiveType?: "box" | "cylinder" | "sphere";
  booleanType?: "union" | "difference" | "intersection";
  dimensions?: { w?: number; d?: number; h?: number; r?: number; height?: number };
  children: string[];
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scaleVec: [number, number, number];
  visible: boolean;
}

let kernelReady = false;
let idCounter = 0;

const COLORS = [
  "#0071e3", "#1d1d1f", "#707070", "#b64400",
  "#0066cc", "#333333", "#8b8b8b", "#cc7000",
];

function nextColor(shape: Shape): string {
  return shape._color || COLORS[idCounter % COLORS.length];
}

function nextId(): string {
  return `s${idCounter++}`;
}

export class Shape {
  _id: string;
  _name: string;
  _manifold: Manifold | null = null;
  _color: string | null = null;
  _visible: boolean = true;
  _position: [number, number, number] = [0, 0, 0];
  _rotation: [number, number, number] = [0, 0, 0];
  _scaleVec: [number, number, number] = [1, 1, 1];
  _operation: "none" | "built" | "union" | "difference" | "intersection" = "none";
  _children: Shape[] = [];
  _primitiveType: "box" | "cylinder" | "sphere" | null = null;
  _dimW: number = 0;
  _dimD: number = 0;
  _dimH: number = 0;
  _dimR: number = 0;

  constructor() {
    this._id = nextId();
    this._name = `Shape ${this._id}`;
  }

  private clone(): Shape {
    const s = new Shape();
    s._id = this._id;
    s._name = this._name;
    s._manifold = this._manifold;
    s._color = this._color;
    s._visible = this._visible;
    s._position = [...this._position];
    s._rotation = [...this._rotation];
    s._scaleVec = [...this._scaleVec];
    s._operation = this._operation;
    s._children = [...this._children];
    s._primitiveType = this._primitiveType;
    s._dimW = this._dimW;
    s._dimD = this._dimD;
    s._dimH = this._dimH;
    s._dimR = this._dimR;
    return s;
  }

  named(name: string): Shape {
    const s = this.clone();
    s._name = name;
    return s;
  }

  colored(hex: string): Shape {
    const s = this.clone();
    s._color = hex;
    return s;
  }

  translate(x: number, y: number, z: number): Shape {
    const s = this.clone();
    s._position = [s._position[0] + x, s._position[1] + y, s._position[2] + z];
    return s;
  }

  moveTo(x: number, y: number, z: number): Shape {
    const s = this.clone();
    s._position = [x, y, z];
    return s;
  }

  rotate(rx: number, ry: number, rz: number): Shape {
    const s = this.clone();
    s._rotation = [rx, ry, rz];
    return s;
  }

  scale(sx: number, sy?: number, sz?: number): Shape {
    const s = this.clone();
    const _sy = sy ?? sx;
    const _sz = sz ?? sx;
    s._scaleVec = [sx, _sy, _sz];
    return s;
  }

  toShapeData(): ShapeData {
    let type: "primitive" | "boolean" = "primitive";
    let booleanType: "union" | "difference" | "intersection" | undefined;
    let children: string[] = [];

    if (this._operation !== "none" && this._operation !== "built") {
      type = "boolean";
      booleanType = this._operation;
      children = this._children.map((c) => c._id);
    }

    return {
      id: this._id,
      name: this._name,
      type,
      primitiveType: this._primitiveType ?? undefined,
      booleanType,
      dimensions:
        this._primitiveType === "box"
          ? { w: this._dimW, d: this._dimD, h: this._dimH }
          : this._primitiveType === "cylinder"
          ? { height: this._dimH, r: this._dimR }
          : this._primitiveType === "sphere"
          ? { r: this._dimR }
          : undefined,
      children,
      color: this._color || nextColor(this),
      position: [...this._position],
      rotation: [...this._rotation],
      scaleVec: [...this._scaleVec],
      visible: this._visible,
    };
  }

  union(...others: Shape[]): Shape {
    const s = new Shape();
    s._name = `${this._name} ∪ ${others.map((o) => o._name).join(" ∪ ")}`;
    s._operation = "union";
    s._children = [this, ...others];
    s._color = this._color;
    return s;
  }

  subtract(...others: Shape[]): Shape {
    const s = new Shape();
    s._name = `${this._name} \u2212 ${others.map((o) => o._name).join(" \u2212 ")}`;
    s._operation = "difference";
    s._children = [this, ...others];
    s._color = this._color;
    return s;
  }

  intersect(other: Shape): Shape {
    const s = new Shape();
    s._name = `${this._name} ∩ ${other._name}`;
    s._operation = "intersection";
    s._children = [this, other];
    s._color = this._color;
    return s;
  }
}

export function box(w: number, d: number, h: number): Shape {
  const s = new Shape();
  s._primitiveType = "box";
  s._dimW = w;
  s._dimD = d;
  s._dimH = h;
  s._name = `Box ${w}×${d}×${h}`;
  return s;
}

export function cylinder(h: number, r: number): Shape {
  const s = new Shape();
  s._primitiveType = "cylinder";
  s._dimH = h;
  s._dimR = r;
  s._name = `Cylinder h${h} r${r}`;
  return s;
}

export function sphere(r: number): Shape {
  const s = new Shape();
  s._primitiveType = "sphere";
  s._dimR = r;
  s._name = `Sphere r${r}`;
  return s;
}

export async function ensureEngine(): Promise<void> {
  if (!kernelReady) {
    await initKernel();
    kernelReady = true;
  }
}

export function isEngineReady(): boolean {
  return kernelReady;
}

function materializePrimitive(s: Shape): Manifold {
  const w = getWasm();
  switch (s._primitiveType) {
    case "box":
      return w.Manifold.cube([s._dimW, s._dimD, s._dimH], false);
    case "cylinder":
      return w.Manifold.cylinder(s._dimH, s._dimR, s._dimR, 64, false);
    case "sphere":
      return w.Manifold.sphere(s._dimR, 64);
    default:
      return w.Manifold.cube([1, 1, 1], true);
  }
}

function applyShapeTransforms(m: Manifold, shape: Shape): Manifold {
  let result = m;
  const [sx, sy, sz] = shape._scaleVec;
  const [rx, ry, rz] = shape._rotation;
  const [tx, ty, tz] = shape._position;

  if (sx !== 1 || sy !== 1 || sz !== 1) {
    result = result.scale([sx, sy, sz]);
  }
  if (rx !== 0 || ry !== 0 || rz !== 0) {
    const degToRad = (d: number) => (d * Math.PI) / 180;
    result = result.rotate([degToRad(rx), degToRad(ry), degToRad(rz)]);
  }
  if (tx !== 0 || ty !== 0 || tz !== 0) {
    result = result.translate([tx, ty, tz]);
  }
  return result;
}

export function materialize(shape: Shape): Manifold {
  if (shape._operation === "none" || shape._operation === "built") {
    const m = materializePrimitive(shape);
    shape._manifold = applyShapeTransforms(m, shape);
    shape._operation = "built";
    return shape._manifold;
  }

  const childManifolds = shape._children.map((child) => materialize(child));

  switch (shape._operation) {
    case "union": {
      let result = childManifolds[0];
      for (let i = 1; i < childManifolds.length; i++) {
        result = result.add(childManifolds[i]);
      }
      shape._manifold = result;
      break;
    }
    case "difference": {
      let result = childManifolds[0];
      for (let i = 1; i < childManifolds.length; i++) {
        result = result.subtract(childManifolds[i]);
      }
      shape._manifold = result;
      break;
    }
    case "intersection": {
      let result = childManifolds[0];
      for (let i = 1; i < childManifolds.length; i++) {
        result = result.intersect(childManifolds[i]);
      }
      shape._manifold = result;
      break;
    }
  }

  shape._manifold = applyShapeTransforms(shape._manifold, shape);
  return shape._manifold;
}

export function shapeToMesh(s: Shape): { positions: Float32Array; indices: Uint32Array; normals: Float32Array } {
  const m = materialize(s);
  const mesh = m.getMesh();
  return {
    positions: new Float32Array(mesh.vertProperties),
    indices: new Uint32Array(mesh.triVerts),
    normals: new Float32Array(mesh.vertProperties.length),
  };
}
