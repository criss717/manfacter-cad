"use client";

import * as THREE from "three";
import {
  isEngineReady,
  createBox,
  createCylinder,
  createSphere,
  union,
  difference,
  type ManifoldShape,
  manifoldToMesh,
  translate,
  rotate,
  scale,
} from "@/cad";
import type { ShapeData } from "@/cad";

function toMM(v: number): number {
  return Math.abs(v);
}

function materializePrimitive(data: ShapeData): ManifoldShape | null {
  switch (data.primitiveType) {
    case "box": {
      const w = toMM(data.dimensions?.w ?? 10);
      const d = toMM(data.dimensions?.d ?? 10);
      const h = toMM(data.dimensions?.h ?? 10);
      return createBox(w, d, h);
    }
    case "cylinder": {
      const h = toMM(data.dimensions?.height ?? 10);
      const r = toMM(data.dimensions?.r ?? 5);
      return createCylinder(h, r, 48);
    }
    case "sphere": {
      const r = toMM(data.dimensions?.r ?? 5);
      return createSphere(r, 48);
    }
    default:
      return null;
  }
}

function applyTransforms(
  m: ManifoldShape,
  data: ShapeData
): ManifoldShape {
  const [sx, sy, sz] = data.scaleVec;
  const [rx, ry, rz] = data.rotation;
  const [tx, ty, tz] = data.position;

  let result = m;
  if (sx !== 1 || sy !== 1 || sz !== 1) {
    result = scale(result, sx, sy, sz);
  }
  if (rx !== 0 || ry !== 0 || rz !== 0) {
    result = rotate(result, rx, ry, rz);
  }
  if (tx !== 0 || ty !== 0 || tz !== 0) {
    result = translate(result, tx, ty, tz);
  }
  return result;
}

function toThreeGeometry(m: ManifoldShape): THREE.BufferGeometry {
  const mesh = manifoldToMesh(m._manifold);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geom.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geom.computeVertexNormals();
  return geom;
}

function buildGeometry(
  shapeId: string,
  allShapes: Record<string, ShapeData>,
  cache: Map<string, THREE.BufferGeometry>,
  visited: Set<string>
): THREE.BufferGeometry | null {
  if (visited.has(shapeId)) return null;
  visited.add(shapeId);
  if (cache.has(shapeId)) return cache.get(shapeId)!;

  const data = allShapes[shapeId];
  if (!data || !data.visible) return null;

  let m: ManifoldShape | null = null;

  if (data.type === "primitive") {
    m = materializePrimitive(data);
    if (m) m = applyTransforms(m, data);
  } else if (data.type === "boolean" && data.children) {
    const childGeoms = data.children
      .map((childId) => {
        const child = allShapes[childId];
        if (!child) return null;
        const innerM = buildGeometry(childId, allShapes, cache, visited);
        if (!innerM) return null;

        const innerGeom = innerM;
        const childPos = child.position;
        const childRot = child.rotation;
        const childScale = child.scaleVec;

        if (child.type === "primitive") {
          const primitive = materializePrimitive(child);
          if (!primitive) return null;
          const transformed = applyTransforms(primitive, child);
          return transformed;
        }

        return null;
      })
      .filter((c): c is ManifoldShape => c !== null);

    if (childGeoms.length === 0) return null;

    if (data.booleanType === "union") {
      m = union(childGeoms);
    } else if (data.booleanType === "difference") {
      const [base, ...cutters] = childGeoms;
      m = cutters.length > 0 ? difference(base, cutters) : base;
    }

    if (m) m = applyTransforms(m, data);
  }

  if (!m) return null;
  const geom = toThreeGeometry(m);
  cache.set(shapeId, geom);
  return geom;
}

export interface SceneObject {
  id: string;
  name: string;
  geometry: THREE.BufferGeometry;
  color: string;
  visible: boolean;
}

export function buildSceneObjects(
  shapes: Record<string, ShapeData>
): SceneObject[] {
  if (!isEngineReady()) return [];

  const cache = new Map<string, THREE.BufferGeometry>();
  const objects: SceneObject[] = [];
  const visited = new Set<string>();

  const rootIds = Object.keys(shapes).filter((id) => {
    const shape = shapes[id];
    return !Object.values(shapes).some((other) => other.children?.includes(id));
  });

  for (const rootId of rootIds) {
    const v = new Set<string>();
    const geom = buildGeometry(rootId, shapes, cache, v);
    const data = shapes[rootId];
    if (geom && data) {
      objects.push({
        id: data.id,
        name: data.name,
        geometry: geom,
        color: data.color,
        visible: data.visible,
      });
    }
  }

  return objects;
}
