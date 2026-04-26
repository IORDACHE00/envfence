# dotsafe

A tiny, type-safe environment-variable schema with a chainable, Zod-like API. Loads `.env` files, validates everything at boot, and gives you a single fully-typed `config` object. **Zero dependencies. ~2KB gzipped.**

```ts
import * as d from "dotsafe";

export const config = d.env({
  PORT: d.port().default(3000).description("Port the server listens on"),
  DATABASE_URL: d.url().required().description("PostgreSQL connection string"),
  NODE_ENV: d.enumeration(["development", "production", "test"]).required(),
  SENTRY_DSN: d.url().requiredIf((v) => v.NODE_ENV === "production"),
  ENCRYPTION_KEY: d.string().required().minLength(32).maxLength(32),
  ENABLE_METRICS: d.boolean().default(false),
});

// Fully typed:
//   config.PORT            → number
//   config.DATABASE_URL    → string
//   config.NODE_ENV        → "development" | "production" | "test"
//   config.SENTRY_DSN      → string | undefined
//   config.ENCRYPTION_KEY  → string  (guaranteed 32 chars)
//   config.ENABLE_METRICS  → boolean
```

## Why

- **`dotenv`** loads but doesn't validate.
- **`@t3-oss/env` / Zod-based**: powerful, but you're pulling Zod (~50KB) just to check `PORT=3000`.

`dotsafe` is the middle ground: a focused chainable API that reads like a schema, errors that tell you exactly what to fix and where, and full TypeScript inference — in ~2KB gzipped.

## Install

```sh
npm install dotsafe
```

## Two import styles — both fully tree-shakable

Pick whichever reads better to you. Both result in identical bundle output.

```ts
// Namespaced (Zod-like, recommended for larger schemas)
import * as d from "dotsafe";
d.env({ PORT: d.port().default(3000) });
```

```ts
// Named (slightly less typing for small schemas)
import { env, port } from "dotsafe";
env({ PORT: port().default(3000) });
```

Both styles tree-shake correctly because `dotsafe` ships **individual named exports** (no runtime namespace object). Modern bundlers (esbuild, Rollup, Vite, Webpack 5, tsup) statically resolve `d.X` accesses and drop unused validators. If you only use `d.port` and `d.url`, the rest never make it into your bundle.

> **Why this matters:** Zod exports a single `z` object literal, which pins every validator into your bundle whether you use them or not. `dotsafe` deliberately avoids that shape so you get the namespace ergonomics *and* the tree-shaking. (You can name it anything: `import * as d`, `import * as ds`, `import * as dot` — all work the same.)

## How it works

`env(schema)` runs **at module load**: it loads your `.env` files, merges with `process.env`, validates the whole shape, and either returns a fully-typed config object or throws an `EnvError` listing every problem at once.

This means a missing or malformed env var **fails your CI build, your container start, your `next build`** — before any user-facing code runs. No more "we deployed and then noticed `STRIPE_SECRET_KEY` was empty."

```ts
// src/config.ts
import * as d from "dotsafe";

export const config = d.env({
  PORT: d.port().default(3000),
  DATABASE_URL: d.url().required(),
});
```

```ts
// src/server.ts
import { config } from "./config.js";
// If config.ts couldn't load, the import throws and your app never starts.
```

## Errors

When something's wrong, you get one `EnvError` listing every issue:

```
Invalid environment variables:

  PORT            Expected number
                  got: "abc"
                    in .env:4
                    fix: PORT=3000

  DATABASE_URL    Missing required variable
                    fix: add DATABASE_URL=... to your .env

  NODE_ENV        Expected one of: development, production, test
                  got: "staging"
                    in .env:1
                    fix: NODE_ENV=development

  ENCRYPTION_KEY  Expected string of length ≥ 32
                  got: "too-short"
                    in .env:6
                    fix: set ENCRYPTION_KEY to a longer value
```

No "fix one error, redeploy, fix the next." All issues, all at once, with file + line numbers when they came from a `.env` file.

## API

### Validators

Every validator is a chainable builder. All of them share a common base of modifiers, plus type-specific ones.

| Factory              | Returns                     | Type-specific methods                            |
| -------------------- | --------------------------- | ------------------------------------------------ |
| `string()`           | `string`                    | `.minLength(n)`, `.maxLength(n)`, `.pattern(re)` |
| `number()`           | `number`                    | `.min(n)`, `.max(n)`, `.int()`                   |
| `port()`             | `number` (1–65535, integer) | `.min(n)`, `.max(n)`                             |
| `boolean()`          | `boolean`                   | accepts `true/false`, `1/0`, `yes/no`, `on/off`  |
| `enumeration([...])` | union of literals           | —                                                |
| `url()`              | `string`                    | `.protocols(["https", ...])`                     |
| `email()`            | `string`                    | —                                                |
| `array()`            | `string[]`                  | `.separator("\|")` (default `","`)               |
| `json<T>()`          | `T`                         | parses with `JSON.parse`                         |
| `custom<T>(fn)`      | `T`                         | escape hatch, `fn(raw, key) → T`                 |

### Common modifiers (chainable on every validator)

| Method                             | Effect                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `.default(value)`                  | Use `value` when the variable is missing.                                           |
| `.required()`                      | Explicit "must be present" (this is the default — handy for readability).           |
| `.optional()`                      | Allow missing; type becomes `T \| undefined`.                                       |
| `.requiredIf((parsed) => boolean)` | Required only when the predicate is true (evaluated against already-parsed values). |
| `.description(text)`               | Attach docs (handy for tooling). Doesn't affect parsing.                            |

### Enforcing exact length (secrets, keys, tokens)

For fixed-size secrets, combine `.minLength()` and `.maxLength()`:

```ts
import * as d from "dotsafe";

d.env({
  // 32-char AES-256 key, exactly
  ENCRYPTION_KEY: d.string().required().minLength(32).maxLength(32),

  // 64-char HMAC secret, exactly
  WEBHOOK_SIGNING_SECRET: d.string().required().minLength(64).maxLength(64),

  // pattern + length, e.g. webhook secrets that start with whsec_
  STRIPE_WEBHOOK_SECRET: d.string()
    .required()
    .pattern(/^whsec_[A-Za-z0-9]+$/)
    .minLength(38),
});
```

### `env(schema, options?)`

```ts
env(schema, {
  files?: string[] | false,                     // default: ['.env.local', '.env'] (first wins)
  cwd?: string,                                 // default: process.cwd()
  source?: Record<string, string | undefined>,  // override sources entirely (e.g. for tests)
  safe?: boolean,                               // return { success, data?, error? } instead of throwing
})
```

**Throwing form** (recommended):

```ts
export const config = env({ ... });            // throws EnvError on any issue
```

**Safe form** (if you need to handle errors yourself):

```ts
const result = env({ ... }, { safe: true });
if (!result.success) {
  console.error(result.error.message);
  process.exit(1);
}
const config = result.data;
```

## File loading & precedence

Same model as `dotenv` / `dotenv-flow`, just simpler:

1. Files listed in `options.files` are loaded **in priority order — first wins**.
   - Default: `['.env.local', '.env']` (so `.env.local` overrides `.env`).
2. `process.env` always wins over file values (CI, Docker, and platform secrets stay in charge).

```ts
env(schema, {
  files: [".env.staging", ".env.local", ".env"],
});
```

Pass `files: false` to skip dotenv loading entirely (e.g. in serverless runtimes).

## Cross-field validation: `requiredIf`

```ts
import * as d from "dotsafe";

const config = d.env({
  NODE_ENV: d.enumeration(["development", "production"]),
  SENTRY_DSN: d.url().requiredIf((v) => v.NODE_ENV === "production"),
});
```

`SENTRY_DSN` is only required when `NODE_ENV === "production"`. The predicate runs against already-parsed values, so you get full validated types inside it. If `SENTRY_DSN` is provided in dev, it's still validated as a URL — but its absence is only an error in production.

## Validating in CI before you ship

Because `env()` throws on the first import of your config module, you can gate any CI step on it. The simplest way is a `validate-env` script that just imports the config:

```ts
// scripts/validate-env.ts
import "../src/config.js"; // triggers env() validation, throws on any issue
console.log("✓ env OK");
```

```json
// package.json
{
  "scripts": {
    "validate-env": "tsx scripts/validate-env.ts",
    "build": "npm run validate-env && next build"
  }
}
```

```yaml
# .github/workflows/deploy.yml
- run: npm run validate-env
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    ENCRYPTION_KEY: ${{ secrets.ENCRYPTION_KEY }}
    NODE_ENV: production
    # SENTRY_DSN intentionally missing → step fails, deploy is blocked
- run: npm run build
- run: npm run deploy
```

If a secret isn't wired up in CI, the validate step exits non-zero with the full `EnvError` report and the rest of the pipeline never runs.

## Bundle size

```
dist/index.js   5.01 KB minified  /  2.16 KB gzipped (ESM)
dist/index.cjs  5.57 KB minified  /  2.39 KB gzipped (CJS)
```

Zero runtime dependencies. `sideEffects: false` for clean tree-shaking.

## TypeScript

`dotsafe` infers everything from your schema. The `Infer<typeof schema>` helper is exported if you ever need the type explicitly:

```ts
import * as d from "dotsafe";

const schema = {
  PORT: d.port().default(3000),
  API_KEY: d.string().required(),
};

type Config = d.Infer<typeof schema>;
// { PORT: number; API_KEY: string }

export const config = d.env(schema);
```

## License

MIT
