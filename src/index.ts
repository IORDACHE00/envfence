import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type Predicate = (env: Record<string, unknown>) => boolean;

type AnySpec = Spec<unknown>;

interface Spec<T> {
  /** Phantom type for inference. */
  __t: T;
  /** Discriminator. */
  _t:
    | "string"
    | "number"
    | "port"
    | "boolean"
    | "enum"
    | "url"
    | "email"
    | "array"
    | "json"
    | "custom";
  _required?: boolean;
  _optional?: boolean;
  _default?: unknown;
  _hasDefault?: boolean;
  _requiredIf?: Predicate;
  _description?: string;

  // string
  _minLength?: number;
  _maxLength?: number;
  _pattern?: RegExp;

  // number / port
  _min?: number;
  _max?: number;
  _int?: boolean;

  // enum
  _values?: readonly string[];

  // url
  _protocols?: string[];

  // array
  _separator?: string;

  // custom
  _parse?: (raw: string, key: string) => unknown;
}

export interface StringBuilder<
  T extends string | undefined = string,
> extends Spec<T> {
  default(value: string): StringBuilder<T>;
  required(): StringBuilder<T>;
  optional(): StringBuilder<T | undefined>;
  requiredIf(predicate: Predicate): StringBuilder<T | undefined>;
  description(text: string): StringBuilder<T>;
  minLength(n: number): StringBuilder<T>;
  maxLength(n: number): StringBuilder<T>;
  pattern(re: RegExp): StringBuilder<T>;
}

export interface NumberBuilder<
  T extends number | undefined = number,
> extends Spec<T> {
  default(value: number): NumberBuilder<T>;
  required(): NumberBuilder<T>;
  optional(): NumberBuilder<T | undefined>;
  requiredIf(predicate: Predicate): NumberBuilder<T | undefined>;
  description(text: string): NumberBuilder<T>;
  min(n: number): NumberBuilder<T>;
  max(n: number): NumberBuilder<T>;
  int(): NumberBuilder<T>;
}

export interface BooleanBuilder<
  T extends boolean | undefined = boolean,
> extends Spec<T> {
  default(value: boolean): BooleanBuilder<T>;
  required(): BooleanBuilder<T>;
  optional(): BooleanBuilder<T | undefined>;
  requiredIf(predicate: Predicate): BooleanBuilder<T | undefined>;
  description(text: string): BooleanBuilder<T>;
}

export interface EnumBuilder<
  V extends string,
  T extends V | undefined = V,
> extends Spec<T> {
  default(value: V): EnumBuilder<V, T>;
  required(): EnumBuilder<V, T>;
  optional(): EnumBuilder<V, T | undefined>;
  requiredIf(predicate: Predicate): EnumBuilder<V, T | undefined>;
  description(text: string): EnumBuilder<V, T>;
}

export interface UrlBuilder<
  T extends string | undefined = string,
> extends Spec<T> {
  default(value: string): UrlBuilder<T>;
  required(): UrlBuilder<T>;
  optional(): UrlBuilder<T | undefined>;
  requiredIf(predicate: Predicate): UrlBuilder<T | undefined>;
  description(text: string): UrlBuilder<T>;
  protocols(list: string[]): UrlBuilder<T>;
}

export interface EmailBuilder<
  T extends string | undefined = string,
> extends Spec<T> {
  default(value: string): EmailBuilder<T>;
  required(): EmailBuilder<T>;
  optional(): EmailBuilder<T | undefined>;
  requiredIf(predicate: Predicate): EmailBuilder<T | undefined>;
  description(text: string): EmailBuilder<T>;
}

export interface ArrayBuilder<
  T extends string[] | undefined = string[],
> extends Spec<T> {
  default(value: string[]): ArrayBuilder<T>;
  required(): ArrayBuilder<T>;
  optional(): ArrayBuilder<T | undefined>;
  requiredIf(predicate: Predicate): ArrayBuilder<T | undefined>;
  description(text: string): ArrayBuilder<T>;
  separator(sep: string): ArrayBuilder<T>;
}

export interface JsonBuilder<T = unknown> extends Spec<T> {
  default(value: T): JsonBuilder<T>;
  required(): JsonBuilder<T>;
  optional(): JsonBuilder<T | undefined>;
  requiredIf(predicate: Predicate): JsonBuilder<T | undefined>;
  description(text: string): JsonBuilder<T>;
}

export interface CustomBuilder<T> extends Spec<T> {
  default(value: T): CustomBuilder<T>;
  required(): CustomBuilder<T>;
  optional(): CustomBuilder<T | undefined>;
  requiredIf(predicate: Predicate): CustomBuilder<T | undefined>;
  description(text: string): CustomBuilder<T>;
}

type AnyBuilder = Spec<unknown>;

type Schema = Record<string, AnyBuilder>;

export type Infer<S extends Schema> = {
  [K in keyof S]: S[K] extends Spec<infer T> ? T : never;
};

function attachBase(s: AnySpec): void {
  const self = s as AnySpec & Record<string, unknown>;

  self.default = (v: unknown) => {
    s._default = v;
    s._hasDefault = true;
    return self;
  };

  self.required = () => {
    s._required = true;
    return self;
  };

  self.optional = () => {
    s._optional = true;
    return self;
  };

  self.requiredIf = (fn: Predicate) => {
    s._requiredIf = fn;
    return self;
  };

  self.description = (d: string) => {
    s._description = d;
    return self;
  };
}

function make<T>(t: AnySpec["_t"]): Spec<T> & Record<string, unknown> {
  const s = { _t: t } as unknown as Spec<T> & Record<string, unknown>;

  attachBase(s as unknown as AnySpec);

  return s;
}

export function string(): StringBuilder {
  const s = make<string>("string");

  s.minLength = (n: number) => {
    (s as unknown as Spec<string>)._minLength = n;
    return s;
  };

  s.maxLength = (n: number) => {
    (s as unknown as Spec<string>)._maxLength = n;
    return s;
  };

  s.pattern = (re: RegExp) => {
    (s as unknown as Spec<string>)._pattern = re;
    return s;
  };

  return s as unknown as StringBuilder;
}

function numberLike<T>(
  t: AnySpec["_t"],
): NumberBuilder<T extends number | undefined ? T : number> {
  const s = make<number>(t);

  s.min = (n: number) => {
    (s as unknown as Spec<number>)._min = n;
    return s;
  };

  s.max = (n: number) => {
    (s as unknown as Spec<number>)._max = n;
    return s;
  };

  s.int = () => {
    (s as unknown as Spec<number>)._int = true;
    return s;
  };

  return s as unknown as NumberBuilder<
    T extends number | undefined ? T : number
  >;
}

export function number(): NumberBuilder {
  return numberLike("number");
}

export function port(): NumberBuilder {
  const s = numberLike("port") as unknown as Spec<number>;

  s._int = true;
  s._min = 1;
  s._max = 65535;

  return s as unknown as NumberBuilder;
}

export function boolean(): BooleanBuilder {
  return make<boolean>("boolean") as unknown as BooleanBuilder;
}

export function enumeration<const V extends readonly string[]>(
  values: V,
): EnumBuilder<V[number]> {
  const s = make<V[number]>("enum") as unknown as Spec<V[number]>;

  s._values = values;

  return s as unknown as EnumBuilder<V[number]>;
}

export function url(): UrlBuilder {
  const s = make<string>("url");

  s.protocols = (list: string[]) => {
    (s as unknown as Spec<string>)._protocols = list;
    return s;
  };

  return s as unknown as UrlBuilder;
}

export function email(): EmailBuilder {
  return make<string>("email") as unknown as EmailBuilder;
}

export function array(): ArrayBuilder {
  const s = make<string[]>("array");

  s.separator = (sep: string) => {
    (s as unknown as Spec<string[]>)._separator = sep;
    return s;
  };

  return s as unknown as ArrayBuilder;
}

export function json<T = unknown>(): JsonBuilder<T> {
  return make<T>("json") as unknown as JsonBuilder<T>;
}

export function custom<T>(
  fn: (raw: string, key: string) => T,
): CustomBuilder<T> {
  const s = make<T>("custom") as unknown as Spec<T>;

  s._parse = fn as (raw: string, key: string) => unknown;

  return s as unknown as CustomBuilder<T>;
}

export interface EnvIssue {
  key: string;
  message: string;
  got?: string;
  fix: string;
  source?: string;
}

export class EnvError extends Error {
  // Declared but assigned via defineProperty below so it stays non-enumerable.
  // That keeps Node's default "unhandled error" output from dumping the whole
  // issues array under the message
  issues!: EnvIssue[];

  constructor(issues: EnvIssue[]) {
    const lines = ["Invalid environment variables:", ""];
    const w = Math.max(...issues.map((i) => i.key.length));

    for (const i of issues) {
      lines.push(`  ${i.key.padEnd(w)}  ${i.message}`);

      if (i.got !== undefined)
        lines.push(`  ${" ".repeat(w)}  got: ${JSON.stringify(i.got)}`);
      if (i.source) lines.push(`  ${" ".repeat(w)}    in ${i.source}`);

      lines.push(`  ${" ".repeat(w)}    fix: ${i.fix}`);
      lines.push("");
    }

    super(lines.join("\n"));
    this.name = "EnvError";

    Object.defineProperty(this, "issues", {
      value: issues,
      enumerable: false,
      writable: true,
      configurable: true,
    });

    // drop our internal frames so the top of the stack is the user's call site
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, EnvError);
    }
  }
}

// Force the constructor's display name to "EnvError". When bundlers (esbuild,
// tsup) emit `var EnvError = class _EnvError extends Error {}` the runtime
// constructor name picks up the inner `_EnvError`, which Node's uncaught
// exception printer surfaces as `_EnvError: ...`. Override it here so users
// see a clean `EnvError: ...` regardless of bundler output.
Object.defineProperty(EnvError, "name", { value: "EnvError" });

type SourceMap = Map<string, string>;

function loadFile(path: string, sourceMap: SourceMap): Record<string, string> {
  if (!existsSync(path)) return {};

  const raw = readFileSync(path, "utf8");
  const out: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;

    sourceMap.set(key, `${path}:${i + 1}`);
  }

  return out;
}

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off", ""]);

// practical email check: not RFC-perfect, but rejects obvious garbage.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(
  key: string,
  message: string,
  got: string | undefined,
  fix: string,
): never {
  const e = new Error(message) as Error & {
    __envIssue: true;
    key: string;
    got?: string;
    fix: string;
  };

  e.name = "EnvIssue";
  (e as { __envIssue: boolean }).__envIssue = true;
  (e as { key: string }).key = key;
  (e as { got?: string }).got = got;
  (e as { fix: string }).fix = fix;

  throw e;
}

function parseValue(
  spec: AnySpec,
  raw: string | undefined,
  key: string,
): unknown {
  const missing = raw === undefined || raw === "";

  if (missing) {
    if (spec._hasDefault) return spec._default;
    if (spec._optional || spec._requiredIf) return undefined;
    fail(
      key,
      "Missing required variable",
      undefined,
      `add ${key}=... to your .env`,
    );
  }

  const v = raw as string;

  switch (spec._t) {
    case "string": {
      if (spec._minLength !== undefined && v.length < spec._minLength)
        fail(
          key,
          `Expected string of length ≥ ${spec._minLength}`,
          v,
          `set ${key} to a longer value`,
        );

      if (spec._maxLength !== undefined && v.length > spec._maxLength)
        fail(
          key,
          `Expected string of length ≤ ${spec._maxLength}`,
          v,
          `shorten ${key}`,
        );

      if (spec._pattern && !spec._pattern.test(v))
        fail(
          key,
          `Did not match pattern ${spec._pattern}`,
          v,
          `set ${key} to match ${spec._pattern}`,
        );

      return v;
    }

    case "number":
    case "port": {
      const n = Number(v);

      if (!Number.isFinite(n)) fail(key, "Expected number", v, `${key}=3000`);

      if (spec._int && !Number.isInteger(n))
        fail(key, "Expected integer", v, `${key}=${Math.round(n)}`);

      if (spec._min !== undefined && n < spec._min)
        fail(
          key,
          spec._t === "port"
            ? `Expected port number (${spec._min}–${spec._max ?? 65535})`
            : `Expected number ≥ ${spec._min}`,
          v,
          `${key}=${spec._min}`,
        );

      if (spec._max !== undefined && n > spec._max)
        fail(
          key,
          spec._t === "port"
            ? `Expected port number (${spec._min ?? 1}–${spec._max})`
            : `Expected number ≤ ${spec._max}`,
          v,
          `${key}=${spec._max}`,
        );

      return n;
    }

    case "boolean": {
      const lower = v.toLowerCase();

      if (TRUE_VALUES.has(lower)) return true;
      if (FALSE_VALUES.has(lower)) return false;

      fail(
        key,
        "Expected boolean",
        v,
        `${key}=true (accepted: true/false, 1/0, yes/no, on/off)`,
      );
    }

    case "enum": {
      const values = spec._values!;

      if (!values.includes(v))
        fail(
          key,
          `Expected one of: ${values.join(", ")}`,
          v,
          `${key}=${values[0]}`,
        );

      return v;
    }

    case "url": {
      let parsed: URL;

      try {
        parsed = new URL(v);
      } catch {
        fail(key, "Expected valid URL", v, `${key}=https://example.com`);
      }

      if (spec._protocols) {
        const proto = parsed!.protocol.replace(":", "");

        if (!spec._protocols.includes(proto))
          fail(
            key,
            `Expected URL with protocol: ${spec._protocols.join(", ")}`,
            v,
            `use ${spec._protocols[0]}://...`,
          );
      }

      return v;
    }

    case "email": {
      if (!EMAIL_RE.test(v))
        fail(key, "Expected valid email address", v, `${key}=user@example.com`);
      return v;
    }

    case "array": {
      return v
        .split(spec._separator ?? ",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    case "json": {
      try {
        return JSON.parse(v);
      } catch (e) {
        fail(
          key,
          `Expected valid JSON (${(e as Error).message})`,
          v,
          `${key}='{"key":"value"}'`,
        );
      }
    }

    case "custom": {
      return spec._parse!(v, key);
    }
  }
}

export interface EnvOptions {
  /** Override the source object. Defaults to .env files merged with process.env. */
  source?: Record<string, string | undefined>;
  /**
   * Dotenv files to load, in priority order (first wins). Pass `false` to skip.
   * Default: `['.env.local', '.env']`. `process.env` always wins over files.
   */
  files?: string[] | false;
  /** Working directory for resolving relative file paths. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Return `{ success, data?, error? }` instead of throwing. */
  safe?: boolean;
}

export type SafeResult<T> =
  | { success: true; data: T; error?: undefined }
  | { success: false; data?: undefined; error: EnvError };

export function env<S extends Schema>(
  schema: S,
  options?: EnvOptions,
): Infer<S>;
export function env<S extends Schema>(
  schema: S,
  options: EnvOptions & { safe: true },
): SafeResult<Infer<S>>;
export function env<S extends Schema>(
  schema: S,
  options: EnvOptions = {},
): Infer<S> | SafeResult<Infer<S>> {
  const sourceMap: SourceMap = new Map();
  const cwd = options.cwd ?? process.cwd();

  // load files in reverse priority order so higher-priority entries overwrite
  let fileVars: Record<string, string> = {};

  if (options.files !== false) {
    const files = options.files ?? [".env.local", ".env"];

    for (let i = files.length - 1; i >= 0; i--) {
      fileVars = {
        ...fileVars,
        ...loadFile(resolve(cwd, files[i]!), sourceMap),
      };
    }
  }

  // process.env wins over files (standard precedence)
  const source = options.source ?? { ...fileVars, ...process.env };

  const result: Record<string, unknown> = {};
  const issues: EnvIssue[] = [];

  // fist pass: parse everything we can.
  for (const key of Object.keys(schema)) {
    const spec = schema[key]! as AnySpec;

    try {
      result[key] = parseValue(spec, source[key], key);
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        (err as { __envIssue?: true }).__envIssue
      ) {
        const e = err as EnvIssue;

        issues.push({
          key: e.key,
          message: e.message,
          got: e.got,
          fix: e.fix,
          source: sourceMap.get(e.key),
        });
      } else {
        throw err;
      }
    }
  }

  // second pass: evaluate `requiredIf` predicates against partially parsed values
  for (const key of Object.keys(schema)) {
    const spec = schema[key]! as AnySpec;
    if (!spec._requiredIf || spec._hasDefault) continue;

    const raw = source[key];
    if (raw !== undefined && raw !== "") continue;

    if (!spec._requiredIf(result)) continue;
    issues.push({
      key,
      message: "Missing variable required by condition",
      fix: `add ${key}=... to your .env`,
      source: sourceMap.get(key),
    });
  }

  if (issues.length > 0) {
    const error = new EnvError(issues);

    if (options.safe) return { success: false, error };

    throw error;
  }

  return options.safe
    ? ({ success: true, data: result as Infer<S> } as SafeResult<Infer<S>>)
    : (result as Infer<S>);
}
