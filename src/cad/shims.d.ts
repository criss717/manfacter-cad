/**
 * Type declarations for third-party packages used by the CAD engine
 * that lack proper TypeScript types or have export resolution issues.
 */

declare module 'opencascade.js' {
  const oc: unknown;
  export default oc;
}

declare module 'sharp' {
  interface SharpInstance {
    png(): SharpInstance;
    toBuffer(): Promise<Buffer>;
  }
  function sharp(input: Buffer): SharpInstance;
  export default sharp;
}
