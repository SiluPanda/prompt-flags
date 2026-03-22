# prompt-flags

AI-native feature flags for prompt variants, model selection, and LLM parameter configuration.

[![npm version](https://img.shields.io/npm/v/prompt-flags.svg)](https://www.npmjs.com/package/prompt-flags)
[![license](https://img.shields.io/npm/l/prompt-flags.svg)](https://github.com/SiluPanda/prompt-flags/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/prompt-flags.svg)](https://nodejs.org)

---

## Description

`prompt-flags` is a local-first feature flag library purpose-built for AI applications. It provides deterministic, in-process evaluation of feature flags that control which prompt text to serve, which model to call, what parameters to use, and how to distribute these choices across user segments with percentage-based rollout.

Unlike general-purpose feature flag systems, `prompt-flags` treats AI configuration as a first-class concern. Flag types include `prompt` (prompt text variants), `model` (model name and parameters), `config` (arbitrary typed JSON), and `boolean` (kill switches). Evaluation is entirely local -- no network calls, no external services, no API keys. Configuration lives in your repository as JSON, flags are resolved deterministically using MurmurHash3 consistent hashing, and the same user always receives the same variant across application restarts and server instances.

---

## Installation

```bash
npm install prompt-flags
```

Requires Node.js >= 18.

---

## Quick Start

```typescript
import { createClient } from 'prompt-flags';

const client = createClient({
  config: {
    flags: [
      {
        key: 'system-prompt',
        type: 'prompt',
        enabled: true,
        variants: [
          { key: 'v1', value: 'You are a helpful assistant.' },
          { key: 'v2', value: 'You are a concise assistant. Be brief.' },
        ],
        defaultVariant: 'v1',
        rules: [
          {
            conditions: [{ attribute: 'plan', operator: 'equals', value: 'pro' }],
            serve: { variant: 'v2' },
          },
        ],
      },
    ],
  },
});

// Evaluate for a specific user context
const prompt = client.getPrompt('system-prompt', { key: 'user-123', plan: 'pro' });
// => 'You are a concise assistant. Be brief.'

const fallback = client.getPrompt('system-prompt', { key: 'user-456', plan: 'free' });
// => 'You are a helpful assistant.'
```

---

## Features

- **Four AI-native flag types** -- `prompt`, `model`, `config`, and `boolean` flags with typed accessors for each.
- **Deterministic percentage rollout** -- MurmurHash3-based consistent hashing maps every user to a stable bucket per flag. The same user always gets the same variant.
- **Rich targeting rules** -- 14 comparison operators (`equals`, `notEquals`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`, `matches`, `exists`, `notExists`) with optional negation.
- **Attribute-based conditions** -- Target users by `key`, `plan`, `region`, `email`, `role`, or any custom attribute via dot-notation (`custom.betaTester`).
- **First-match rule evaluation** -- Rules are evaluated in order; the first match determines the variant. If no rule matches, the default variant is served.
- **Percentage-based rollout** -- Split traffic across variants with weighted allocation (e.g., 80/20, 50/25/25).
- **Reusable segments** -- Define named groups of conditions once and reference them across multiple flags.
- **Test overrides** -- Force specific variants in tests without modifying flag configuration.
- **Evaluation callbacks** -- Hook into every flag evaluation for logging, analytics, and observability.
- **Default context merging** -- Set baseline context attributes that apply to every evaluation.
- **Zero network dependencies** -- All evaluation happens in-process. One runtime dependency (`murmurhash3js`).
- **Full TypeScript support** -- Complete type definitions for all exports with generic type parameters.

---

## API Reference

### `createClient(config: FlagClientConfig): FlagClient`

Creates a new flag client instance. This is the main entry point for the library.

```typescript
import { createClient } from 'prompt-flags';

const client = createClient({
  config: flagConfiguration,
  defaultContext: { region: 'us-east-1' },
  onEvaluation: (result) => console.log('Evaluated:', result.flagKey, result.variantKey),
  onError: (err) => console.error('Flag error:', err),
});
```

---

### FlagClient Methods

#### `client.getPrompt(key: string, ctx: EvaluationContext): string`

Evaluates a `prompt`-type flag and returns the resolved prompt string.

Throws `FlagNotFoundError` if the flag does not exist. Throws `FlagTypeMismatchError` if the flag is not of type `prompt`.

```typescript
const prompt = client.getPrompt('system-prompt', { key: 'user-123', plan: 'enterprise' });
```

#### `client.getModel(key: string, ctx: EvaluationContext): ModelConfig`

Evaluates a `model`-type flag and returns the resolved model configuration object.

Throws `FlagNotFoundError` if the flag does not exist. Throws `FlagTypeMismatchError` if the flag is not of type `model`.

```typescript
const model = client.getModel('model-select', { key: 'user-123', plan: 'pro' });
// => { model: 'gpt-4o', temperature: 0.3 }
```

#### `client.getConfig<T>(key: string, ctx: EvaluationContext): T`

Evaluates a `config`-type flag and returns the resolved typed configuration value.

Throws `FlagNotFoundError` if the flag does not exist. Throws `FlagTypeMismatchError` if the flag is not of type `config`.

```typescript
const limits = client.getConfig<{ rpm: number }>('rate-limit', { key: 'user-123' });
// => { rpm: 100 }
```

#### `client.isEnabled(key: string, ctx: EvaluationContext): boolean`

Evaluates a `boolean`-type flag and returns `true` or `false`.

Throws `FlagNotFoundError` if the flag does not exist. Throws `FlagTypeMismatchError` if the flag is not of type `boolean`.

```typescript
if (client.isEnabled('new-summarizer', { key: 'user-123' })) {
  // use new summarizer
}
```

#### `client.evaluate<T>(key: string, ctx: EvaluationContext): EvaluationResult<T>`

Low-level evaluation method. Returns the full `EvaluationResult` including the resolved variant key, value, evaluation reason, and flag enabled status. Works with any flag type.

Throws `FlagNotFoundError` if the flag does not exist.

```typescript
const result = client.evaluate<boolean>('feature-x', { key: 'user-123', plan: 'pro' });
// => {
//   flagKey: 'feature-x',
//   variantKey: 'on',
//   value: true,
//   reason: 'rule_match',
//   flagEnabled: true,
// }
```

#### `client.getFlagKeys(): string[]`

Returns an array of all flag keys in the configuration.

```typescript
const keys = client.getFlagKeys();
// => ['system-prompt', 'model-select', 'rate-limit', 'feature-x']
```

#### `client.getFlag(key: string): FlagDefinition | null`

Returns the full flag definition for a given key, or `null` if the flag does not exist.

```typescript
const flag = client.getFlag('system-prompt');
if (flag) {
  console.log(flag.type);           // 'prompt'
  console.log(flag.variants.length); // 2
}
```

#### `client.overrideForTest(key: string, variantKey: string): void`

Forces a specific variant for a flag. Overrides take highest priority, bypassing all targeting rules and rollout logic. Intended for use in tests.

```typescript
client.overrideForTest('feature-x', 'on');
client.isEnabled('feature-x', { key: 'any-user' }); // => true
```

#### `client.clearOverride(key: string): void`

Removes a test override for a specific flag, restoring normal evaluation.

```typescript
client.clearOverride('feature-x');
```

#### `client.clearAllOverrides(): void`

Removes all test overrides, restoring normal evaluation for every flag.

```typescript
client.clearAllOverrides();
```

---

### Types

#### `FlagType`

```typescript
type FlagType = 'prompt' | 'model' | 'config' | 'boolean';
```

#### `EvaluationReason`

Describes why a particular variant was selected.

```typescript
type EvaluationReason = 'rule_match' | 'default' | 'disabled' | 'error' | 'override';
```

- `rule_match` -- A targeting rule matched the evaluation context.
- `default` -- No rule matched; the default variant was served.
- `disabled` -- The flag is disabled (`enabled: false`); the default variant was served.
- `error` -- An error occurred during evaluation.
- `override` -- A test override was active for this flag.

#### `ComparisonOperator`

```typescript
type ComparisonOperator =
  | 'equals'
  | 'notEquals'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'matches'
  | 'exists'
  | 'notExists';
```

#### `EvaluationContext`

The context object passed to every evaluation. The `key` field is required and is used for deterministic bucketing.

```typescript
interface EvaluationContext {
  key: string;
  plan?: string;
  region?: string;
  email?: string;
  role?: string;
  custom?: Record<string, string | number | boolean | string[]>;
}
```

#### `ModelConfig`

The value shape returned by `getModel()`.

```typescript
interface ModelConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  [k: string]: unknown;
}
```

#### `RuleCondition`

A single condition within a targeting rule.

```typescript
interface RuleCondition {
  attribute: string;
  operator: ComparisonOperator;
  value?: string | number | boolean;
  values?: (string | number)[];
  negate?: boolean;
}
```

#### `TargetingRule`

A targeting rule consists of conditions (evaluated with AND logic) and a serve directive.

```typescript
interface TargetingRule {
  description?: string;
  conditions?: RuleCondition[];
  serve: { variant: string } | { rollout: Array<{ variant: string; weight: number }> };
}
```

#### `FlagVariant`

A named variant with its value.

```typescript
interface FlagVariant {
  key: string;
  value: unknown;
}
```

#### `FlagDefinition`

The complete definition of a single flag.

```typescript
interface FlagDefinition {
  key: string;
  type: FlagType;
  enabled?: boolean;
  variants: FlagVariant[];
  defaultVariant: string;
  rules?: TargetingRule[];
}
```

#### `FlagConfiguration`

The top-level configuration object containing all flags and optional segments.

```typescript
interface FlagConfiguration {
  flags: FlagDefinition[];
  segments?: Record<string, { conditions: RuleCondition[] }>;
}
```

#### `EvaluationResult<T>`

The full result of evaluating a flag.

```typescript
interface EvaluationResult<T = unknown> {
  flagKey: string;
  variantKey: string;
  value: T;
  reason: EvaluationReason;
  flagEnabled: boolean;
}
```

#### `FlagClientConfig`

Configuration options for `createClient()`.

```typescript
interface FlagClientConfig {
  config: FlagConfiguration;
  defaultContext?: Partial<EvaluationContext>;
  onEvaluation?: (e: EvaluationResult<unknown>) => void;
  onError?: (e: Error) => void;
}
```

---

### Error Classes

All errors extend `FlagError`, which extends `Error` and includes a `code` string property.

#### `FlagError`

Base error class for all prompt-flags errors.

```typescript
class FlagError extends Error {
  readonly code: string;
}
```

#### `FlagNotFoundError`

Thrown when evaluating a flag key that does not exist in the configuration.

```typescript
class FlagNotFoundError extends FlagError {
  readonly flagKey: string;
  // code: 'FLAG_NOT_FOUND'
}
```

#### `FlagTypeMismatchError`

Thrown when calling a typed accessor (e.g., `getPrompt()`) on a flag of a different type.

```typescript
class FlagTypeMismatchError extends FlagError {
  readonly flagKey: string;
  // code: 'FLAG_TYPE_MISMATCH'
}
```

#### `VariantNotFoundError`

Thrown when a rule or override references a variant key that does not exist in the flag's variants array.

```typescript
class VariantNotFoundError extends FlagError {
  readonly flagKey: string;
  // code: 'VARIANT_NOT_FOUND'
}
```

---

## Configuration

Flag configuration is passed directly to `createClient()` as an inline object. The configuration contains an array of flag definitions and optional reusable segments.

### Flag Definition Structure

```json
{
  "flags": [
    {
      "key": "support-prompt",
      "type": "prompt",
      "enabled": true,
      "variants": [
        { "key": "control", "value": "You are a helpful support agent." },
        { "key": "concise", "value": "You are a concise support agent. Be brief." }
      ],
      "defaultVariant": "control",
      "rules": [
        {
          "description": "Enterprise users get concise prompt",
          "conditions": [
            { "attribute": "plan", "operator": "in", "values": ["enterprise", "business"] }
          ],
          "serve": { "variant": "concise" }
        },
        {
          "description": "50/50 rollout for remaining users",
          "serve": {
            "rollout": [
              { "variant": "control", "weight": 50 },
              { "variant": "concise", "weight": 50 }
            ]
          }
        }
      ]
    }
  ]
}
```

### Flag Types

| Type | Accessor | Value Shape |
|------|----------|-------------|
| `prompt` | `getPrompt()` | `string` |
| `model` | `getModel()` | `{ model: string, temperature?: number, maxTokens?: number, ... }` |
| `config` | `getConfig<T>()` | Any typed JSON value |
| `boolean` | `isEnabled()` | `true` or `false` |

### Evaluation Order

1. **Test overrides** -- If `overrideForTest()` has been called for the flag, the override variant is returned immediately with reason `override`.
2. **Disabled check** -- If `enabled` is `false`, the default variant is returned with reason `disabled`.
3. **Targeting rules** -- Rules are evaluated in order. The first rule whose conditions all match determines the variant. Reason: `rule_match`.
4. **Default fallback** -- If no rule matches, the default variant is returned with reason `default`.

### Percentage Rollout

Rollout uses deterministic bucketing: `murmurhash3(contextKey + ":" + flagKey) % 10000` assigns each user to a bucket in `[0, 9999]`. Weights are normalized and mapped to bucket ranges. The same user always lands in the same bucket for the same flag, ensuring consistent variant assignment across evaluations and application restarts.

```typescript
{
  serve: {
    rollout: [
      { variant: 'control', weight: 80 },
      { variant: 'experiment', weight: 20 },
    ],
  },
}
```

### Segments

Define reusable condition groups at the top level and reference them across flags.

```typescript
const config: FlagConfiguration = {
  segments: {
    'enterprise-users': {
      conditions: [
        { attribute: 'plan', operator: 'in', values: ['enterprise', 'business'] },
      ],
    },
  },
  flags: [
    // ... flags can reference segments
  ],
};
```

---

## Error Handling

All errors thrown by `prompt-flags` extend `FlagError` and include a machine-readable `code` property for programmatic handling.

```typescript
import {
  createClient,
  FlagNotFoundError,
  FlagTypeMismatchError,
  VariantNotFoundError,
} from 'prompt-flags';

const client = createClient({ config });

try {
  const prompt = client.getPrompt('nonexistent-flag', { key: 'user-1' });
} catch (err) {
  if (err instanceof FlagNotFoundError) {
    console.error(`Flag not found: ${err.flagKey}`);        // err.code === 'FLAG_NOT_FOUND'
  } else if (err instanceof FlagTypeMismatchError) {
    console.error(`Type mismatch for: ${err.flagKey}`);     // err.code === 'FLAG_TYPE_MISMATCH'
  } else if (err instanceof VariantNotFoundError) {
    console.error(`Variant missing for: ${err.flagKey}`);   // err.code === 'VARIANT_NOT_FOUND'
  }
}
```

### Error Callback

Register a global error handler via the `onError` option:

```typescript
const client = createClient({
  config,
  onError: (err) => {
    logger.error('Flag evaluation error', { error: err.message });
  },
});
```

The `onError` callback is invoked when `evaluate()` throws. The error is still re-thrown after the callback executes.

---

## Advanced Usage

### Evaluation Callbacks for Analytics

Use the `onEvaluation` hook to pipe every flag evaluation to your analytics or observability system.

```typescript
const client = createClient({
  config,
  onEvaluation: (result) => {
    analytics.track('flag_evaluated', {
      flagKey: result.flagKey,
      variantKey: result.variantKey,
      reason: result.reason,
      flagEnabled: result.flagEnabled,
    });
  },
});
```

### Default Context

Set baseline context attributes that are merged into every evaluation. Per-evaluation context values take precedence.

```typescript
const client = createClient({
  config,
  defaultContext: { region: 'us-east-1', plan: 'free' },
});

// The region 'us-east-1' and plan 'free' are applied unless overridden
const prompt = client.getPrompt('support-prompt', { key: 'user-123' });

// Per-evaluation context overrides defaults
const prompt2 = client.getPrompt('support-prompt', { key: 'user-456', plan: 'enterprise' });
```

### Multi-Condition Targeting

Combine multiple conditions in a single rule. All conditions must match (AND logic).

```typescript
{
  rules: [
    {
      description: 'Enterprise users in US region',
      conditions: [
        { attribute: 'plan', operator: 'equals', value: 'enterprise' },
        { attribute: 'region', operator: 'in', values: ['us-east-1', 'us-west-2'] },
      ],
      serve: { variant: 'premium' },
    },
  ],
}
```

### Custom Attributes

Target users by arbitrary attributes using the `custom` context field. Reference them in conditions with the `custom.` prefix.

```typescript
const result = client.evaluate('feature-x', {
  key: 'user-123',
  custom: {
    betaTester: true,
    companySize: 500,
    tags: ['ai', 'ml'],
  },
});

// In flag configuration:
{
  conditions: [
    { attribute: 'custom.betaTester', operator: 'equals', value: true },
    { attribute: 'custom.companySize', operator: 'greaterThan', value: 100 },
  ],
  serve: { variant: 'beta' },
}
```

### Regex Matching

Use the `matches` operator for pattern-based targeting.

```typescript
{
  conditions: [
    { attribute: 'email', operator: 'matches', value: '@(corp|enterprise)\\.com$' },
  ],
  serve: { variant: 'enterprise' },
}
```

### Condition Negation

Any condition can be negated with `negate: true`, inverting its result.

```typescript
{
  conditions: [
    { attribute: 'plan', operator: 'in', values: ['free', 'trial'], negate: true },
  ],
  serve: { variant: 'premium' },
}
// Matches users whose plan is NOT 'free' or 'trial'
```

### Test Overrides

Force specific variants in test environments without modifying flag configuration. Overrides take highest priority.

```typescript
import { createClient } from 'prompt-flags';

const client = createClient({ config });

// Force a specific variant
client.overrideForTest('model-select', 'smart');
const model = client.getModel('model-select', { key: 'any-user' });
// => { model: 'gpt-4o', temperature: 0.3 }

// Verify the override reason
const result = client.evaluate('model-select', { key: 'any-user' });
console.log(result.reason); // => 'override'

// Clean up
client.clearOverride('model-select');
// or
client.clearAllOverrides();
```

### Gradual Model Migration

Roll out a new model progressively using percentage-based allocation.

```typescript
const client = createClient({
  config: {
    flags: [
      {
        key: 'model-select',
        type: 'model',
        enabled: true,
        variants: [
          { key: 'current', value: { model: 'gpt-4o', temperature: 0.3 } },
          { key: 'next', value: { model: 'claude-sonnet', temperature: 0.2 } },
        ],
        defaultVariant: 'current',
        rules: [
          {
            serve: {
              rollout: [
                { variant: 'current', weight: 95 },
                { variant: 'next', weight: 5 },
              ],
            },
          },
        ],
      },
    ],
  },
});

// 5% of users deterministically get claude-sonnet
const model = client.getModel('model-select', { key: 'user-789' });
```

### Inspecting Flag Configuration

Use `getFlagKeys()` and `getFlag()` to programmatically inspect the loaded configuration.

```typescript
const keys = client.getFlagKeys();

for (const key of keys) {
  const flag = client.getFlag(key);
  if (flag) {
    console.log(`${flag.key} (${flag.type}): ${flag.variants.length} variants, enabled=${flag.enabled}`);
  }
}
```

---

## TypeScript

`prompt-flags` is written in TypeScript and ships with full type declarations. All public types are exported from the package root.

```typescript
import {
  createClient,
  FlagError,
  FlagNotFoundError,
  FlagTypeMismatchError,
  VariantNotFoundError,
} from 'prompt-flags';

import type {
  FlagType,
  EvaluationReason,
  ComparisonOperator,
  EvaluationContext,
  ModelConfig,
  RuleCondition,
  TargetingRule,
  FlagVariant,
  FlagDefinition,
  FlagConfiguration,
  EvaluationResult,
  FlagClientConfig,
  FlagClient,
} from 'prompt-flags';
```

Generic type parameters are supported on `evaluate()` and `getConfig()`:

```typescript
interface RateLimitConfig {
  rpm: number;
  burstLimit: number;
}

const limits = client.getConfig<RateLimitConfig>('rate-limit', { key: 'user-1' });
// limits is typed as RateLimitConfig
```

---

## License

MIT
