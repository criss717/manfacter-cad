/**
 * REST POST fallback for CAD generation.
 *
 * Route: POST /api/generate
 * Body: { code: string, modelId?: string }
 * Returns: { success, modelId, bbox, volume, glbUrl, stlUrl, params }
 *
 * This is a non-WebSocket alternative for clients that cannot use WS.
 * Uses the same complete ForgeCAD sandbox as the WebSocket agent tools.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const OUTPUT_DIR = resolve(process.cwd(), 'output');

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { code?: string; modelId?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const code = body.code;
  if (!code || typeof code !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid "code" field' },
      { status: 400 },
    );
  }

  const modelId = body.modelId ?? randomUUID().replace(/-/g, '').slice(0, 12);
  const modelDir = join(OUTPUT_DIR, modelId);

  try {
    await mkdir(modelDir, { recursive: true });

    // Save the script
    const scriptPath = join(modelDir, '_script.js');
    await writeFile(scriptPath, code, 'utf8');

    // Initialize engine and import the full CAD module (same as tools.ts sandbox)
    const cad = await import('../../../cad/index');
    await cad.initEngine();

    // Complete ForgeCAD API surface — same bindings as WS agent sandbox
    const sandbox: Record<string, unknown> = {
      box: cad.box, cylinder: cad.cylinder, sphere: cad.sphere, torus: cad.torus,
      union: cad.union, difference: cad.difference, intersection: cad.intersection,
      group: cad.group, hull3d: cad.hull3d,
      fillet: cad.fillet, chamfer: cad.chamfer, shell: cad.shell,
      hole: cad.hole, boss: cad.boss, pocket: cad.pocket,
      draft: cad.draft, offsetSolid: cad.offsetSolid,
      split: cad.split, splitByPlane: cad.splitByPlane, trimByPlane: cad.trimByPlane,
      shellShape: cad.shellShape,
      translate: cad.translate, rotate: cad.rotate, scale: cad.scale, mirror: cad.mirror,
      rotateX: cad.rotateX, rotateY: cad.rotateY, rotateZ: cad.rotateZ,
      moveTo: cad.moveTo, rotateAround: cad.rotateAround,
      pointAlong: cad.pointAlong, moveToLocal: cad.moveToLocal,
      linearPattern: cad.linearPattern, circularPattern: cad.circularPattern,
      mirrorCopy: cad.mirrorCopy, circularLayout: cad.circularLayout, polygonVertices: cad.polygonVertices,
      getBoundingBox: cad.getBoundingBox, getVolume: cad.getVolume,
      getSurfaceArea: cad.getSurfaceArea, getTriangleCount: cad.getTriangleCount,
      isEmpty: cad.isEmpty, checkCollisions: cad.checkCollisions,
      face: cad.face, edge: cad.edge, faceNames: cad.faceNames, edgeNames: cad.edgeNames,
      edgesOf: cad.edgesOf, edgesBetween: cad.edgesBetween,
      selectEdges: cad.selectEdges, selectEdge: cad.selectEdge,
      coalesceEdges: cad.coalesceEdges, faceHistory: cad.faceHistory,
      withReferences: cad.withReferences, placeReference: cad.placeReference,
      attachTo: cad.attachTo, onFace: cad.onFace, referencePoint: cad.referencePoint,
      prefixLabels: cad.prefixLabels, renameLabel: cad.renameLabel,
      dropLabels: cad.dropLabels, dropAllLabels: cad.dropAllLabels,
      refine: cad.refine, refineToLength: cad.refineToLength,
      refineToTolerance: cad.refineToTolerance, smoothOut: cad.smoothOut,
      warp: cad.warp, simplify: cad.simplify, slice: cad.slice,
      project: cad.project, minGap: cad.minGap,
      intersectWithPlane: cad.intersectWithPlane, projectToPlane: cad.projectToPlane,
      toSTL: cad.toSTL, toGLB: cad.toGLB, toSTEP: cad.toSTEP,
      Param: cad.Param, collectParams: cad.collectParams, applyParams: cad.applyParams,
      rect: cad.rect, circle2d: cad.circle2d, roundedRect: cad.roundedRect,
      polygon: cad.polygon, ngon: cad.ngon, ellipse: cad.ellipse,
      slot: cad.slot, star: cad.star, path: cad.path, stroke: cad.stroke,
      union2d: cad.union2d, difference2d: cad.difference2d, intersection2d: cad.intersection2d,
      hull2d: cad.hull2d, constrainedSketch: cad.constrainedSketch,
      sketchFromSvg: cad.sketchFromSvg, filletCorners: cad.filletCorners,
      dxfSketch: cad.dxfSketch, svgSketch: cad.svgSketch,
      Sketch: cad.Sketch, ConstraintSketch: cad.ConstraintSketch,
      Point2D: cad.Point2D, Line2D: cad.Line2D, Circle2D: cad.Circle2D, Rectangle2D: cad.Rectangle2D,
      point: cad.point, line: cad.line, circle: cad.circle, rectangle: cad.rectangle,
      Constraint: cad.Constraint, degrees: cad.degrees, radians: cad.radians,
      spline2d: cad.spline2d, spline3d: cad.spline3d, loft: cad.loft, sweep: cad.sweep,
      Curve3D: cad.Curve3D, Route3D: cad.Route3D, Blend: cad.Blend,
      assembly: cad.assembly, joint: cad.joint,
      Assembly: cad.Assembly, SolvedAssembly: cad.SolvedAssembly,
      Transform: cad.Transform, composeChain: cad.composeChain, bomToCsv: cad.bomToCsv,
      cutPlane: cad.cutPlane, explodeView: cad.explodeView,
      jointsView: cad.jointsView, viewConfig: cad.viewConfig,
      bom: cad.bom, dim: cad.dim, dimLine: cad.dimLine, robotExport: cad.robotExport,
      verify: cad.verify, spec: cad.spec,
      importSketch: cad.importSketch, importPart: cad.importPart, importSvgSketch: cad.importSvgSketch,
      partLibrary: cad.partLibrary, lib: cad.lib,
      levelSet: cad.levelSet,
      Shape: cad.Shape, TrackedShape: cad.TrackedShape, ShapeGroup: cad.ShapeGroup,
      __CAD_RESULT: null as unknown,
    };

    // Execute code in sandboxed async context — support both `const result =` and `return`
    // Block scope wrapping prevents `const` redeclaration errors when sandbox
    // parameter names (box, hole, etc.) collide with user-declared `const` names.
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const wrappedCode = `{\n${code}\nif (typeof result !== "undefined") { __CAD_RESULT = result; }\n}`;
    const fn = new AsyncFunction(
      ...Object.keys(sandbox),
      `${wrappedCode}
return __CAD_RESULT;`,
    );

    const userReturn = await fn(...Object.values(sandbox));
    const result = (sandbox.__CAD_RESULT ?? userReturn) as Record<string, unknown> | null;

    // Duck-typing: accept Shape (has manifold + id), TrackedShape, or ShapeGroup (has shapes array)
    const isShapeLike = result && typeof result === 'object' && 'manifold' in result && 'id' in result;
    const isGroupLike = result && typeof result === 'object' && 'shapes' in result && Array.isArray((result as { shapes: unknown[] }).shapes);

    if (!result || typeof result !== 'object' || (!isShapeLike && !isGroupLike)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'El código no definió una variable `result` con un Shape válido. ' +
            'Asegúrate de que tu código termine con: const result = tuPieza;',
        },
        { status: 422 },
      );
    }

    // For ShapeGroup, use first shape for export; for Shape/TrackedShape, use directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exportShape: any = isGroupLike
      ? (result as { shapes: unknown[] }).shapes[0] ?? result
      : result;

    // Export files
    const glbBuffer = cad.toGLB(exportShape);
    const stlBuffer = cad.toSTL(exportShape);

    const glbPath = join(modelDir, `${modelId}.glb`);
    const stlPath = join(modelDir, `${modelId}.stl`);
    await writeFile(glbPath, glbBuffer);
    await writeFile(stlPath, stlBuffer);

    // Collect params and facts
    const params = cad.collectParams(code);
    const bbox = cad.getBoundingBox(exportShape);
    const volume = cad.getVolume(exportShape);
    const numTri = cad.getTriangleCount(exportShape);

    // Save facts
    const factsPath = join(modelDir, 'facts.json');
    await writeFile(factsPath, JSON.stringify({ bbox, volume, numTri, params }, null, 2));

    return NextResponse.json({
      success: true,
      modelId,
      bbox,
      volume,
      glbUrl: `/api/cad/output/${modelId}/${modelId}.glb`,
      stlUrl: `/api/cad/output/${modelId}/${modelId}.stl`,
      params,
      code,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[GENERATE] Error: ${error}`, err instanceof Error ? err.stack : '');
    return NextResponse.json(
      { success: false, error },
      { status: 500 },
    );
  }
}
