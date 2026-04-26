import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  env,
  string,
  number,
  port,
  boolean,
  enumeration,
  url,
  email,
  array,
  json,
  custom,
  EnvError,
} from "./index.js";

const noFiles = { files: false as const };

describe("string()", () => {
  it("parses a value", () => {
    const r = env({ FOO: string() }, { source: { FOO: "bar" }, ...noFiles });
    expect(r.FOO).toBe("bar");
  });

  it("uses .default() when missing", () => {
    const r = env({ FOO: string().default("baz") }, { source: {}, ...noFiles });
    expect(r.FOO).toBe("baz");
  });

  it("throws when missing", () => {
    expect(() => env({ FOO: string() }, { source: {}, ...noFiles })).toThrow(EnvError);
  });

  it(".optional() returns undefined when missing", () => {
    const r = env({ FOO: string().optional() }, { source: {}, ...noFiles });
    expect(r.FOO).toBeUndefined();
  });

  it(".required() is explicit no-op (still required by default)", () => {
    const r = env(
      { FOO: string().required() },
      { source: { FOO: "x" }, ...noFiles },
    );
    expect(r.FOO).toBe("x");
  });

  it(".minLength() enforces min", () => {
    expect(() =>
      env(
        { KEY: string().minLength(32) },
        { source: { KEY: "short" }, ...noFiles },
      ),
    ).toThrow(/length ≥ 32/);
  });

  it(".maxLength() enforces max", () => {
    expect(() =>
      env(
        { KEY: string().maxLength(3) },
        { source: { KEY: "hello" }, ...noFiles },
      ),
    ).toThrow(/length ≤ 3/);
  });

  it(".pattern() enforces regex", () => {
    expect(() =>
      env(
        { X: string().pattern(/^[a-z]+$/) },
        { source: { X: "123" }, ...noFiles },
      ),
    ).toThrow(/match pattern/);
  });
});

describe("number()", () => {
  it("coerces to number", () => {
    const r = env({ N: number() }, { source: { N: "3000" }, ...noFiles });
    expect(r.N).toBe(3000);
    const _typed: number = r.N;
    expect(_typed).toBe(3000);
  });

  it("rejects non-number", () => {
    expect(() =>
      env({ N: number() }, { source: { N: "abc" }, ...noFiles }),
    ).toThrow(/Expected number/);
  });

  it(".int() rejects fractional values", () => {
    expect(() =>
      env({ N: number().int() }, { source: { N: "3.14" }, ...noFiles }),
    ).toThrow(/Expected integer/);
  });

  it(".min() / .max() enforce bounds", () => {
    expect(() =>
      env({ N: number().min(1).max(10) }, { source: { N: "20" }, ...noFiles }),
    ).toThrow(/≤ 10/);
  });
});

describe("port()", () => {
  it("accepts a valid port", () => {
    const r = env({ PORT: port() }, { source: { PORT: "8080" }, ...noFiles });
    expect(r.PORT).toBe(8080);
  });

  it("rejects 0", () => {
    expect(() =>
      env({ PORT: port() }, { source: { PORT: "0" }, ...noFiles }),
    ).toThrow(/port number/);
  });

  it("rejects > 65535", () => {
    expect(() =>
      env({ PORT: port() }, { source: { PORT: "70000" }, ...noFiles }),
    ).toThrow(/port number/);
  });

  it("rejects floats", () => {
    expect(() =>
      env({ PORT: port() }, { source: { PORT: "80.5" }, ...noFiles }),
    ).toThrow(/Expected integer/);
  });

  it("uses default", () => {
    const r = env({ PORT: port().default(3000) }, { source: {}, ...noFiles });
    expect(r.PORT).toBe(3000);
  });
});

describe("boolean()", () => {
  it.each([
    ["true", true],
    ["1", true],
    ["yes", true],
    ["on", true],
    ["TRUE", true],
    ["false", false],
    ["0", false],
    ["no", false],
    ["off", false],
  ])("parses %s as %s", (input, expected) => {
    const r = env({ B: boolean() }, { source: { B: input }, ...noFiles });
    expect(r.B).toBe(expected);
  });

  it("rejects garbage", () => {
    expect(() =>
      env({ B: boolean() }, { source: { B: "maybe" }, ...noFiles }),
    ).toThrow(/Expected boolean/);
  });

  it("supports default(false)", () => {
    const r = env({ B: boolean().default(false) }, { source: {}, ...noFiles });
    expect(r.B).toBe(false);
  });
});

describe("enumeration()", () => {
  it("accepts a valid value", () => {
    const r = env(
      { ENV: enumeration(["dev", "prod"]) },
      { source: { ENV: "prod" }, ...noFiles },
    );
    expect(r.ENV).toBe("prod");
    const _check: "dev" | "prod" = r.ENV;
    expect(_check).toBe("prod");
  });

  it("rejects invalid value with helpful message", () => {
    expect(() =>
      env(
        { ENV: enumeration(["dev", "prod"]) },
        { source: { ENV: "staging" }, ...noFiles },
      ),
    ).toThrow(/Expected one of: dev, prod/);
  });
});

describe("url()", () => {
  it("accepts a valid URL", () => {
    const r = env(
      { U: url() },
      { source: { U: "https://example.com" }, ...noFiles },
    );
    expect(r.U).toBe("https://example.com");
  });

  it("rejects garbage", () => {
    expect(() =>
      env({ U: url() }, { source: { U: "not a url" }, ...noFiles }),
    ).toThrow(/valid URL/);
  });

  it(".protocols() restricts protocol", () => {
    expect(() =>
      env(
        { U: url().protocols(["https"]) },
        { source: { U: "http://example.com" }, ...noFiles },
      ),
    ).toThrow(/protocol: https/);
  });
});

describe("email()", () => {
  it("accepts valid email", () => {
    const r = env(
      { E: email() },
      { source: { E: "alice@example.com" }, ...noFiles },
    );
    expect(r.E).toBe("alice@example.com");
  });

  it("rejects garbage", () => {
    expect(() =>
      env({ E: email() }, { source: { E: "not-an-email" }, ...noFiles }),
    ).toThrow(/valid email/);
  });
});

describe("array()", () => {
  it("splits comma-separated", () => {
    const r = env({ A: array() }, { source: { A: "a, b ,c" }, ...noFiles });
    expect(r.A).toEqual(["a", "b", "c"]);
  });

  it(".separator() respects custom separator", () => {
    const r = env(
      { A: array().separator("|") },
      { source: { A: "a|b|c" }, ...noFiles },
    );
    expect(r.A).toEqual(["a", "b", "c"]);
  });
});

describe("json()", () => {
  it("parses a JSON string", () => {
    const r = env(
      { J: json<{ a: number }>() },
      { source: { J: '{"a":1}' }, ...noFiles },
    );
    expect(r.J).toEqual({ a: 1 });
  });

  it("rejects invalid JSON", () => {
    expect(() =>
      env({ J: json() }, { source: { J: "{not-json" }, ...noFiles }),
    ).toThrow(/valid JSON/);
  });
});

describe("custom()", () => {
  it("runs the user function", () => {
    const r = env(
      {
        PAIR: custom((raw) => {
          const [a, b] = raw.split(":");
          return { a, b };
        }),
      },
      { source: { PAIR: "foo:bar" }, ...noFiles },
    );
    expect(r.PAIR).toEqual({ a: "foo", b: "bar" });
  });
});

describe(".description()", () => {
  it("attaches metadata without affecting parsing", () => {
    const r = env(
      { PORT: port().default(3000).description("Server port") },
      { source: {}, ...noFiles },
    );
    expect(r.PORT).toBe(3000);
  });
});

describe(".requiredIf()", () => {
  it("throws when predicate is true and value is missing", () => {
    expect(() =>
      env(
        {
          NODE_ENV: enumeration(["development", "production"]),
          ADMIN_EMAIL: email().requiredIf(
            (v) => v.NODE_ENV === "production",
          ),
        },
        { source: { NODE_ENV: "production" }, ...noFiles },
      ),
    ).toThrow(/ADMIN_EMAIL/);
  });

  it("passes when predicate is false and value is missing", () => {
    const r = env(
      {
        NODE_ENV: enumeration(["development", "production"]),
        ADMIN_EMAIL: email().requiredIf((v) => v.NODE_ENV === "production"),
      },
      { source: { NODE_ENV: "development" }, ...noFiles },
    );
    expect(r.ADMIN_EMAIL).toBeUndefined();
  });

  it("validates the value when present, even if predicate is false", () => {
    expect(() =>
      env(
        {
          NODE_ENV: enumeration(["development", "production"]),
          ADMIN_EMAIL: email().requiredIf(
            (v) => v.NODE_ENV === "production",
          ),
        },
        {
          source: { NODE_ENV: "development", ADMIN_EMAIL: "garbage" },
          ...noFiles,
        },
      ),
    ).toThrow(/valid email/);
  });
});

describe("error aggregation", () => {
  it("collects all issues, not just the first", () => {
    try {
      env(
        {
          A: string(),
          B: number(),
          C: url(),
        },
        { source: { B: "abc", C: "nope" }, ...noFiles },
      );
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as EnvError).issues).toHaveLength(3);
    }
  });

  it("formats messages with key, got, and fix", () => {
    try {
      env(
        {
          PORT: number(),
          NODE_ENV: enumeration(["dev", "prod"]),
        },
        { source: { PORT: "abc", NODE_ENV: "staging" }, ...noFiles },
      );
      expect.fail("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("Invalid environment variables");
      expect(msg).toContain("PORT");
      expect(msg).toContain('got: "abc"');
      expect(msg).toContain("fix:");
    }
  });
});

describe("EnvError ergonomics", () => {
  it("has the expected display name", () => {
    const e = new EnvError([{ key: "X", message: "bad", fix: "fix" }]);
    expect(e.name).toBe("EnvError");
    expect(e.constructor.name).toBe("EnvError");
    expect(e.stack?.split("\n")[0]).toMatch(/^EnvError:/);
  });

  it("keeps `issues` non-enumerable so unhandled errors print clean", () => {
    const e = new EnvError([{ key: "X", message: "bad", fix: "fix" }]);
    // Reachable normally:
    expect(e.issues).toHaveLength(1);
    // ...but not enumerated by default inspectors / JSON.stringify / Object.keys:
    expect(Object.keys(e)).not.toContain("issues");
    expect(JSON.stringify(e)).not.toContain("issues");
  });

  it("strips internal frames from the top of the stack", () => {
    let caught: EnvError | undefined;
    function userCallSite() {
      try {
        env({ FOO: string() }, { source: {}, ...noFiles });
      } catch (err) {
        caught = err as EnvError;
      }
    }
    userCallSite();
    expect(caught).toBeInstanceOf(EnvError);
    // The first stack frame after the header should be the user's frame,
    // not an internal helper like `fail` or `parseValue`.
    const firstFrame = caught!.stack!.split("\n")[1] ?? "";
    expect(firstFrame).not.toMatch(/\bfail\b|\bparseValue\b/);
  });
});

describe("safe mode", () => {
  it("returns { success: true, data } on success", () => {
    const r = env(
      { FOO: string() },
      { source: { FOO: "bar" }, safe: true, ...noFiles },
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.FOO).toBe("bar");
  });

  it("returns { success: false, error } on failure", () => {
    const r = env({ FOO: string() }, { source: {}, safe: true, ...noFiles });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toBeInstanceOf(EnvError);
      expect(r.error.issues[0]!.key).toBe("FOO");
    }
  });
});

describe("source precedence", () => {
  it("source option overrides process.env", () => {
    const original = process.env.FOO;
    process.env.FOO = "from-process";
    try {
      const r = env(
        { FOO: string() },
        { source: { FOO: "from-source" }, ...noFiles },
      );
      expect(r.FOO).toBe("from-source");
    } finally {
      if (original === undefined) delete process.env.FOO;
      else process.env.FOO = original;
    }
  });
});

describe("dotenv loading", () => {
  let dir: string;
  let savedCwd: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dotsafe-"));
    savedCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(savedCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads variables from .env", () => {
    writeFileSync(join(dir, ".env"), "FOO=hello\n");
    const original = process.env.FOO;
    delete process.env.FOO;
    try {
      const r = env({ FOO: string() }, { cwd: dir, files: [".env"] });
      expect(r.FOO).toBe("hello");
    } finally {
      if (original === undefined) delete process.env.FOO;
      else process.env.FOO = original;
    }
  });

  it(".env.local takes precedence over .env (default order)", () => {
    writeFileSync(join(dir, ".env"), "FOO=base\nBAR=baseB\n");
    writeFileSync(join(dir, ".env.local"), "FOO=local\n");
    const original = { ...process.env };
    delete process.env.FOO;
    delete process.env.BAR;
    try {
      const r = env({ FOO: string(), BAR: string() }, { cwd: dir });
      expect(r.FOO).toBe("local");
      expect(r.BAR).toBe("baseB");
    } finally {
      process.env = original;
    }
  });

  it("process.env wins over file values", () => {
    writeFileSync(join(dir, ".env"), "FOO=from-file\n");
    const original = process.env.FOO;
    process.env.FOO = "from-process";
    try {
      const r = env({ FOO: string() }, { cwd: dir, files: [".env"] });
      expect(r.FOO).toBe("from-process");
    } finally {
      if (original === undefined) delete process.env.FOO;
      else process.env.FOO = original;
    }
  });

  it("supports custom file list with custom precedence", () => {
    writeFileSync(join(dir, ".env.staging"), "FOO=staging\n");
    writeFileSync(join(dir, ".env"), "FOO=default\n");
    const original = process.env.FOO;
    delete process.env.FOO;
    try {
      const r = env(
        { FOO: string() },
        { cwd: dir, files: [".env.staging", ".env"] },
      );
      expect(r.FOO).toBe("staging");
    } finally {
      if (original === undefined) delete process.env.FOO;
      else process.env.FOO = original;
    }
  });

  it("issue.source points to the .env file & line", () => {
    writeFileSync(join(dir, ".env"), "# comment\nPORT=abc\n");
    const original = process.env.PORT;
    delete process.env.PORT;
    try {
      env({ PORT: number() }, { cwd: dir, files: [".env"] });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      const issue = (err as EnvError).issues[0]!;
      expect(issue.source).toMatch(/\.env:2$/);
    } finally {
      if (original === undefined) delete process.env.PORT;
      else process.env.PORT = original;
    }
  });

  it("files: false disables file loading", () => {
    writeFileSync(join(dir, ".env"), "FOO=from-file\n");
    const original = process.env.FOO;
    delete process.env.FOO;
    try {
      const r = env(
        { FOO: string().default("fallback") },
        { cwd: dir, files: false },
      );
      expect(r.FOO).toBe("fallback");
    } finally {
      if (original === undefined) delete process.env.FOO;
      else process.env.FOO = original;
    }
  });

  it("strips surrounding quotes from values", () => {
    writeFileSync(join(dir, ".env"), `FOO="quoted value"\nBAR='single'\n`);
    const original = { ...process.env };
    delete process.env.FOO;
    delete process.env.BAR;
    try {
      const r = env(
        { FOO: string(), BAR: string() },
        { cwd: dir, files: [".env"] },
      );
      expect(r.FOO).toBe("quoted value");
      expect(r.BAR).toBe("single");
    } finally {
      process.env = original;
    }
  });
});

describe("README-style example", () => {
  it("parses a realistic config", () => {
    const config = env(
      {
        PORT: port().default(3000).description("Port the server listens on"),
        DATABASE_URL: url()
          .required()
          .description("PostgreSQL connection string"),
        NODE_ENV: enumeration(["development", "production", "test"]).required(),
        ADMIN_EMAIL: email().requiredIf((v) => v.NODE_ENV === "production"),
        JWT_SECRET: string().required().minLength(32),
        FEATURE_FLAGS: boolean().default(false),
      },
      {
        source: {
          DATABASE_URL: "postgres://user:pass@localhost/db",
          NODE_ENV: "development",
          JWT_SECRET: "x".repeat(40),
        },
        ...noFiles,
      },
    );

    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe("development");
    expect(config.ADMIN_EMAIL).toBeUndefined();
    expect(config.FEATURE_FLAGS).toBe(false);
    expect(config.JWT_SECRET.length).toBe(40);

    // type smoke checks
    const _port: number = config.PORT;
    const _flag: boolean = config.FEATURE_FLAGS;
    const _ne: "development" | "production" | "test" = config.NODE_ENV;
    void _port;
    void _flag;
    void _ne;
  });
});
