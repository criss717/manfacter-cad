import { box, cylinder, sphere, Shape } from "./shape";

const GLOBALS: Record<string, unknown> = {
  box,
  cylinder,
  sphere,
};

export interface RunnerResult {
  shapes: Shape[];
  error: string | null;
}

export function runScript(code: string): RunnerResult {
  const shapes: Shape[] = [];

  try {
    const wrappedCode = `
      "use strict";
      return (function() {
        ${code}
      })();
    `;

    const fn = new Function(...Object.keys(GLOBALS), wrappedCode);
    const result = fn(...Object.values(GLOBALS));

    if (result === undefined || result === null) {
      return { shapes: [], error: "El script no devolvió ninguna forma. Asegúrate de usar 'return' para devolver la pieza final." };
    }

    if (result instanceof Shape) {
      shapes.push(result);
    } else if (Array.isArray(result)) {
      for (const item of result) {
        if (item instanceof Shape) {
          shapes.push(item);
        }
      }
    } else {
      return { shapes: [], error: `El script devolvió un tipo no válido: ${typeof result}. Debe devolver un Shape o array de Shapes.` };
    }

    return { shapes, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { shapes: [], error: msg };
  }
}

export function runScriptIntoStore(
  code: string,
  addShape: (data: ReturnType<Shape["toShapeData"]>) => void
): { success: boolean; names: string[]; error: string | null } {
  const result = runScript(code);
  if (result.error) {
    return { success: false, names: [], error: result.error };
  }

  const names: string[] = [];
  const added = new Set<string>();

  function collectAndAdd(s: Shape) {
    if (added.has(s._id)) return;
    added.add(s._id);

    for (const child of s._children) {
      collectAndAdd(child);
    }

    addShape(s.toShapeData());
    names.push(s._name);
  }

  for (const s of result.shapes) {
    collectAndAdd(s);
  }

  return { success: true, names, error: null };
}
