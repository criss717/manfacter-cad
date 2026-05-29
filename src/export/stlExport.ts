"use client";

import * as THREE from "three";

function geometryToSTLBuffer(geometry: THREE.BufferGeometry, name?: string): ArrayBuffer {
  const pos = geometry.getAttribute("position");
  const idx = geometry.index;

  if (!pos) return new ArrayBuffer(84);

  const triangleCount = idx ? idx.count / 3 : pos.count / 3;
  const header = new Uint8Array(80);
  const nameStr = (name || "ManfacterStudio").slice(0, 80);
  for (let i = 0; i < nameStr.length; i++) header[i] = nameStr.charCodeAt(i);

  const bufSize = 84 + Math.floor(triangleCount) * 50;
  const buffer = new ArrayBuffer(bufSize);
  const view = new DataView(buffer);

  new Uint8Array(buffer, 0, 80).set(header);
  view.setUint32(80, Math.floor(triangleCount), true);

  let offset = 84;

  for (let i = 0; i < triangleCount; i++) {
    let a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3;

    if (idx) {
      const i0 = idx.getX(i * 3);
      const i1 = idx.getX(i * 3 + 1);
      const i2 = idx.getX(i * 3 + 2);
      a = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
      b = new THREE.Vector3(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
      c = new THREE.Vector3(pos.getX(i2), pos.getY(i2), pos.getZ(i2));
    } else {
      a = new THREE.Vector3(pos.getX(i * 3), pos.getY(i * 3), pos.getZ(i * 3));
      b = new THREE.Vector3(pos.getX(i * 3 + 1), pos.getY(i * 3 + 1), pos.getZ(i * 3 + 1));
      c = new THREE.Vector3(pos.getX(i * 3 + 2), pos.getY(i * 3 + 2), pos.getZ(i * 3 + 2));
    }

    const edge1 = new THREE.Vector3().subVectors(b, a);
    const edge2 = new THREE.Vector3().subVectors(c, a);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    view.setFloat32(offset, normal.x, true);
    view.setFloat32(offset + 4, normal.y, true);
    view.setFloat32(offset + 8, normal.z, true);
    offset += 12;

    [a, b, c].forEach((v) => {
      view.setFloat32(offset, v.x, true);
      view.setFloat32(offset + 4, v.y, true);
      view.setFloat32(offset + 8, v.z, true);
      offset += 12;
    });

    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

function collectViewportGeometries(): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = [];

  const canvas = document.querySelector("canvas");
  if (!canvas) return geometries;

  try {
    const rendererElement = canvas.parentElement?.querySelector("canvas");
    if (!rendererElement) return geometries;

    const elements = document.querySelectorAll("canvas");
    elements.forEach((el) => {
      const threeData = (el as unknown as Record<string, unknown>)["__r3f"];

      if (threeData) {
        const store = (threeData as Record<string, unknown>)["store"];
        if (store) {
          const scene = (store as Record<string, THREE.Scene>).scene;
          if (scene) {
            scene.traverse((obj: THREE.Object3D) => {
              if (obj instanceof THREE.Mesh && obj.geometry) {
                const cloned = obj.geometry.clone();
                obj.updateWorldMatrix(true, false);
                cloned.applyMatrix4(obj.matrixWorld);
                geometries.push(cloned);
              }
            });
          }
        }
      }
    });
  } catch {
    // fallback: export screenshot
  }

  return geometries;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 0) return new THREE.BufferGeometry();
  if (geos.length === 1) return geos[0];

  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const geo of geos) {
    const pos = geo.getAttribute("position");
    const idx = geo.index;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push(idx.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices.push(i + vertexOffset);
      }
    }
    vertexOffset += pos.count;
  }

  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

export function downloadSTL(name?: string): void {
  const geometries = collectViewportGeometries();

  if (geometries.length === 0) {
    alert("No hay geometría para exportar. Crea una pieza primero.");
    return;
  }

  const merged = mergeGeometries(geometries);
  merged.computeVertexNormals();
  const buffer = geometryToSTLBuffer(merged, name);
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "pieza"}.stl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function captureScreenshot(name?: string): void {
  const canvas = document.querySelector("canvas");
  if (!canvas) {
    alert("No hay visor 3D activo.");
    return;
  }
  canvas.toBlob?.((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "captura"}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
