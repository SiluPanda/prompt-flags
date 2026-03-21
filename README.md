# prompt-flags

AI-native feature flags for prompt variants and model selection. Deterministic bucketing via murmurhash3, targeting rules with 13 operators, and 4 flag types (`prompt`, `model`, `config`, `boolean`).

## Install

```bash
npm install prompt-flags
```

## Quick Start

```typescript
import { createClient, FlagConfiguration } from 'prompt-flags'

const config: FlagConfiguration = {
  flags: [
    {
      key: 'system-prompt',
      type: 'prompt',
      enabled: true,
      variants: [
        { key: 'v1', value: 'You are a helpful assistant.' },
        { key: 'v2', value: 'You are a concise assistant.' },
      ],
      defaultVariant: 'v1',
      rules: [
        {
          conditions: [{ attribute: 'plan', operator: 'equals', value: 'pro' }],
          serve: { variant: 'v2' },
        },
      ],
    },
    {
      key: 'model-select',
      type: 'model',
      enabled: true,
      variants: [
        { key: 'fast', value: { model: 'gpt-3.5-turbo', temperature: 0.7 } },
        { key: 'smart', value: { model: 'gpt-4o', temperature: 0.3 } },
      ],
      defaultVariant: 'fast',
      rules: [
        {
          serve: { rollout: [{ variant: 'smart', weight: 20 }, { variant: 'fast', weight: 80 }] },
        },
      ],
    },
    {
      key: 'new-ui',
      type: 'boolean',
      enabled: true,
      variants: [
        { key: 'on', value: true },
        { key: 'off', value: false },
      ],
      defaultVariant: 'off',
    },
  ],
}

const client = createClient({ config })

const ctx = { key: 'user-123', plan: 'pro' }

// Prompt flag
const prompt = client.getPrompt('system-prompt', ctx)  // 'You are a concise assistant.'

// Model flag (deterministic rollout)
const model = client.getModel('model-select', ctx)     // { model: 'gpt-3.5-turbo', temperature: 0.7 }

// Boolean flag
const enabled = client.isEnabled('new-ui', ctx)        // false
```

## Flag Types

| Type      | Getter         | Value type   |
|-----------|----------------|--------------|
| `prompt`  | `getPrompt`    | `string`     |
| `model`   | `getModel`     | `ModelConfig`|
| `config`  | `getConfig<T>` | `T`          |
| `boolean` | `isEnabled`    | `boolean`    |

## Targeting Rules

Rules are evaluated in order. The first matching rule wins. All conditions within a rule use AND logic.

### Supported operators

| Operator               | Description                          |
|------------------------|--------------------------------------|
| `equals`               | Strict string equality               |
| `notEquals`            | Strict string inequality             |
| `in`                   | Value is in `values` array           |
| `notIn`                | Value is not in `values` array       |
| `contains`             | String contains substring            |
| `startsWith`           | String starts with value             |
| `endsWith`             | String ends with value               |
| `greaterThan`          | Numeric `>`                          |
| `lessThan`             | Numeric `<`                          |
| `greaterThanOrEqual`   | Numeric `>=`                         |
| `lessThanOrEqual`      | Numeric `<=`                         |
| `matches`              | Regex test (value is pattern string) |
| `exists`               | Attribute is not null/undefined      |
| `notExists`            | Attribute is null/undefined          |

Set `negate: true` on any condition to invert it.

### Context attributes

Built-in: `key`, `plan`, `region`, `email`, `role`.
Custom attributes: prefix with `custom.` (e.g., `custom.betaTester`).

## Percentage Rollouts

```typescript
rules: [
  {
    serve: {
      rollout: [
        { variant: 'treatment', weight: 20 },
        { variant: 'control', weight: 80 },
      ],
    },
  },
]
```

Weights are percentages (sum to 100). Bucketing is deterministic: the same `ctx.key` always resolves to the same variant for a given flag.

## Test Overrides

```typescript
client.overrideForTest('new-ui', 'on')
client.isEnabled('new-ui', ctx)  // true, reason: 'override'

client.clearOverride('new-ui')
client.clearAllOverrides()
```

## Callbacks

```typescript
const client = createClient({
  config,
  onEvaluation: (result) => console.log(result),
  onError: (err) => console.error(err),
})
```

## License

MIT
