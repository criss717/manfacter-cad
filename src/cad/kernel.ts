import type { Manifold, ManifoldToplevel } from "manifold-3d";

let wasm: ManifoldToplevel | null = null;

export async function initKernel(): Promise<ManifoldToplevel> {
  if (wasm) return wasm;
  const Module = (await import("manifold-3d")).default;
  wasm = await Module();
  wasm.setup();
  return wasm;
}

export function getWasm(): ManifoldToplevel {
  if (!wasm) throw new Error("Kernel no inicializado — llama initKernel() primero");
  return wasm;
}

export function getManifold(shape?: ManifoldShape): Manifold {
  if (shape?._manifold) return shape._manifold;
  throw new Error("Shape no tiene geometría Manifold. ¿Se llamó a materialize()?");
}

export interface ManifoldShape {
  _manifold: Manifold;
  _mesh?: { positions: Float32Array; indices: Uint32Array; normals: Float32Array };
}

export function manifoldToMesh(m: Manifold): {
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
} {
  const mesh = m.getMesh();
  return {
    positions: new Float32Array(mesh.vertProperties),
    indices: new Uint32Array(mesh.triVerts),
    normals: new Float32Array(mesh.vertProperties.length),
  };
}

export function disposeManifold(m: Manifold): void {
  m.delete();
}
