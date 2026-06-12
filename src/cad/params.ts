/**
 * Parametric model editing.
 *
 * `Param` is a namespace for creating parameter definitions that the frontend
 * property panel can render and the AI agent can embed in generated code.
 *
 * `collectParams` extracts Param calls from a code string.
 * `applyParams` replaces default values with user overrides.
 */

import type { ParamDef } from './types';

// ---------------------------------------------------------------------------
// ParamValue — a number that also carries parameter metadata
// ---------------------------------------------------------------------------

/**
 * A tunable numeric parameter that works as both:
 * - A plain number in arithmetic and function calls (via valueOf)
 * - A ParamDef for the frontend property panel
 *
 * This allows AI-generated code like:
 *   const tamano = Param.number("Tamaño", 100, ...);
 *   box(tamano, tamano, tamano);  // works because tamano.valueOf() === 100
 *
 * while also letting the frontend extract parameter definitions.
 */
class ParamValue extends Number {
  readonly __paramDef: ParamDef;

  constructor(def: ParamDef) {
    super(def.defaultValue as number);
    this.__paramDef = def;
  }

  valueOf(): number {
    return this.__paramDef.defaultValue as number;
  }

  toString(): string {
    return String(this.__paramDef.defaultValue);
  }

  /** Serialize as the full ParamDef so the frontend receives complete metadata. */
  toJSON(): ParamDef {
    return this.__paramDef;
  }
}

// ---------------------------------------------------------------------------
// Param constructors
// ---------------------------------------------------------------------------

export const Param = {
  /**
   * Create a numeric parameter that works as BOTH a number and a ParamDef.
   *
   * Usage:
   *   const w = Param.number("Width", 100, { min: 50, max: 200, unit: "mm" });
   *   box(w, 50, 20);  // w behaves as 100 in arithmetic
   *
   * The returned value extends Number and uses valueOf() for coercion.
   */
  number(
    name: string,
    defaultValue: number,
    options?: { min?: number; max?: number; step?: number; unit?: string }
  ): number & ParamDef {
    const def: ParamDef = {
      name,
      type: 'number',
      defaultValue,
      options: options
        ? { min: options.min, max: options.max, step: options.step }
        : undefined,
      unit: options?.unit,
    };
    return new ParamValue(def) as unknown as number & ParamDef;
  },

  /**
   * Create a boolean parameter.
   */
  bool(name: string, defaultValue: boolean): ParamDef {
    return { name, type: 'bool', defaultValue };
  },

  /**
   * Create a choice (enum) parameter.
   * Alias for the previous `select` — renamed to match ForgeCAD convention.
   */
  choice(
    name: string,
    values: string[],
    defaultValue?: string
  ): ParamDef {
    return {
      name,
      type: 'choice',
      defaultValue: defaultValue ?? values[0],
      options: { values },
    };
  },

  /**
   * Create a select (enum) parameter.
   * @deprecated Use `Param.choice()` instead. Will be removed in a future version.
   */
  select(
    name: string,
    values: string[],
    defaultValue?: string
  ): ParamDef {
    return Param.choice(name, values, defaultValue);
  },
};

// ---------------------------------------------------------------------------
// Code analysis
// ---------------------------------------------------------------------------

/**
 * Extract all `Param.number(...)`, `Param.bool(...)`, and `Param.select(...)`
 * calls from a code string. Returns the list of parameter definitions.
 */
export function collectParams(code: string): ParamDef[] {
  const params: ParamDef[] = [];

  // Match Param.number("name", default, {options})
  const numberRe =
    /Param\.number\s*\(\s*["']([^"']+)["']\s*,\s*([^,)]+)(?:\s*,\s*(\{[^}]*\}))?\s*\)/g;
  // Match Param.bool("name", default)
  const boolRe =
    /Param\.bool\s*\(\s*["']([^"']+)["']\s*,\s*([^)]+)\s*\)/g;
  // Match Param.choice("name", [...], default?) and Param.select("name", [...], default?) (deprecated)
  const choiceRe =
    /Param\.(?:choice|select)\s*\(\s*["']([^"']+)["']\s*,\s*(\[[^\]]+\])(?:\s*,\s*["']([^"']+)["'])?\s*\)/g;

  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = numberRe.exec(code)) !== null) {
    const name = match[1];
    const defaultValue = parseFloat(match[2]);
    let opts: { min?: number; max?: number; step?: number } | undefined;
    if (match[3]) {
      try {
        opts = JSON.parse(match[3].replace(/(\w+)\s*:/g, '"$1":'));
      } catch {
        opts = undefined;
      }
    }
    if (!isNaN(defaultValue)) {
      params.push(Param.number(name, defaultValue, opts));
    }
  }

  // eslint-disable-next-line no-cond-assign
  while ((match = boolRe.exec(code)) !== null) {
    const name = match[1];
    const raw = match[2].trim();
    const defaultValue = raw === 'true';
    params.push(Param.bool(name, defaultValue));
  }

  // eslint-disable-next-line no-cond-assign
  while ((match = choiceRe.exec(code)) !== null) {
    const name = match[1];
    let values: string[];
    try {
      values = JSON.parse(match[2].replace(/'/g, '"'));
    } catch {
      values = [];
    }
    const defaultValue = match[3];
    params.push(Param.choice(name, values, defaultValue));
  }

  return params;
}

/**
 * Replace parameter default values in a code string with user overrides.
 *
 * For numeric params: replaces the second argument of `Param.number("name", VALUE, ...)`
 * For bool params:    replaces the second argument of `Param.bool("name", VALUE)`
 * For select params:  replaces the third argument of `Param.select("name", [...], "VALUE")`
 */
export function applyParams(
  code: string,
  overrides: Record<string, unknown>
): string {
  let result = code;

  for (const [name, value] of Object.entries(overrides)) {
    // Param.number("name", OLD_VALUE, ...)
    const numRe = new RegExp(
      `(Param\\.number\\s*\\(\\s*["']${escapeRegex(name)}["']\\s*,\\s*)([^,)]+)`,
      'g'
    );
    result = result.replace(numRe, `$1${JSON.stringify(value)}`);

    // Param.bool("name", OLD_VALUE)
    const boolRe = new RegExp(
      `(Param\\.bool\\s*\\(\\s*["']${escapeRegex(name)}["']\\s*,\\s*)([^)]+)`,
      'g'
    );
    result = result.replace(boolRe, `$1${JSON.stringify(value)}`);

    // Param.choice("name", [...], "OLD_VALUE") — and deprecated Param.select
    const choiceRe = new RegExp(
      `(Param\\.(?:choice|select)\\s*\\(\\s*["']${escapeRegex(name)}["']\\s*,\\s*\\[[^\\]]+\\]\\s*,\\s*["'])([^"']+)`,
      'g'
    );
    result = result.replace(choiceRe, `$1${value}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
