# prompt-flags -- Specification

## 1. Overview

`prompt-flags` is an AI-native feature flag library for toggling prompt variants, model selection, and LLM parameters per user segment with percentage-based rollout. It provides a local-first, file-based configuration system where flags are defined in JSON or YAML, evaluated entirely in-process with zero network dependencies, and resolved deterministically using consistent hashing. The result is a lightweight, open-source alternative to LaunchDarkly AI Configs that gives teams first-class primitives for the configuration decisions unique to AI applications: which prompt text to serve, which model to call, what temperature and token limits to use, and how to distribute these choices across user segments with gradual rollout percentages.

The gap this package fills is specific and well-defined. AI applications have a configuration problem that traditional feature flag systems were not designed for. A production LLM application must decide, for every request: which prompt to send (the established v1 or the experimental v2?), which model to call (GPT-4o for enterprise users, GPT-4o-mini for free tier?), what parameters to use (temperature 0.3 for factual tasks, 0.7 for creative tasks?), and how to roll out changes safely (5% of users on the new prompt, 95% on the old, ramping up over a week). These are not boolean on/off decisions. They are multivariate configuration choices that must be resolved at runtime based on user attributes, distributed deterministically across user populations, and changeable without code deployment.

LaunchDarkly introduced "AI Configs" in 2024 to address exactly this need. AI Configs let teams manage model ID, temperature, max tokens, top_p, system prompts, and user prompts as flag-controlled configurations. They support targeting rules, percentage rollouts, and environment-specific overrides. The system works well, but it is a paid SaaS product tied to LaunchDarkly's hosted platform. Teams must send evaluation requests to LaunchDarkly's servers (or use their SDK with a persistent connection to LaunchDarkly's streaming infrastructure), pay per-seat pricing, and accept vendor lock-in for a capability that is fundamentally configuration routing -- something that can be computed locally from a static configuration file and a user identifier.

On the open-source side, general-purpose feature flag platforms exist. Unleash provides activation strategies with gradual rollout, user ID targeting, and custom constraints, but it requires running a server and has no AI-specific primitives. GrowthBook combines feature flags with A/B testing and analytics, but requires a warehouse connection and server deployment. Flagsmith, Flipt, and OpenFeature provide flag evaluation, but none model the specific configuration shape of an LLM call (prompt text, model name, temperature, max tokens, tool definitions) as first-class concepts. PostHog offers feature flags with multivariate property-based targeting and deterministic hashing, but it is an analytics-first platform where flags are a secondary feature. None of these tools provide an npm package that a developer can install, point at a local JSON file, and immediately start evaluating AI-specific flags with `client.getPrompt("support-prompt", { userId, plan })`.

On the AI tooling side, Langfuse provides prompt management with A/B testing (recently open-sourced under MIT), but it is a full observability platform that requires server deployment, not a lightweight flag evaluation library. Braintrust provides prompt versioning with evaluation suites, but ties flag-like behavior to their platform. Humanloop provided prompt A/B testing but was acquired by Anthropic and sunset in September 2025. promptfoo evaluates prompt variants for quality comparison, but it is a testing framework, not a runtime flag evaluation engine. None of these tools provide the specific primitive that `prompt-flags` provides: a stateless, in-process function that takes a flag key and user context, evaluates targeting rules against a local configuration file, performs deterministic percentage bucketing, and returns the resolved prompt/model/parameter configuration.

`prompt-flags` occupies the space between hosted AI configuration platforms and ad-hoc conditional logic in application code. It borrows the core concepts from LaunchDarkly (flags, variants, targeting rules, segments, percentage rollouts, evaluation context) and from AI-specific platforms (prompt variants, model selection, parameter configuration), and implements them as a local-first library that evaluates flags entirely in-process from a file-based configuration. No server, no network, no API keys. The configuration file lives in the repository, is committed to git, and changes are visible in pull request diffs. Hot reload via file watching enables configuration changes to take effect without application restart. Evaluation is deterministic: the same user with the same context always receives the same variant, across any number of application instances.

`prompt-flags` provides both a TypeScript/JavaScript API for programmatic use and a CLI for flag management, inspection, and validation. The API returns typed variant values through convenience methods: `getPrompt()` for prompt text, `getModel()` for model configuration objects, `getConfig()` for arbitrary JSON, and `isEnabled()` for boolean kill switches. The CLI provides commands for listing flags, evaluating flags with test contexts, validating configuration files, and inspecting targeting rules. Both interfaces are designed for zero-dependency operation with Node.js built-ins only, plus one runtime dependency (`murmurhash3js` for deterministic bucketing).

---

## 2. Goals and Non-Goals

### Goals

- Provide a `createClient(config)` function that loads flag configuration from a local JSON or YAML file and returns a `FlagClient` instance for evaluating flags against user contexts. The client evaluates flags entirely in-process with no network I/O.
- Support AI-specific flag types as first-class primitives: `prompt` flags (return prompt text or template), `model` flags (return model name plus parameters like temperature, maxTokens, topP), `config` flags (return arbitrary JSON for AI feature configuration), and `boolean` flags (on/off kill switches).
- Support multivariate flags with named variants and percentage-based allocation. A flag can have two or more named variants (e.g., `"control"`, `"variant-a"`, `"variant-b"`), each with a weight that determines its allocation percentage.
- Implement deterministic percentage rollout using consistent hashing: `murmurhash3(userId + flagKey) % 10000` maps every user to a stable bucket for every flag. The same user always receives the same variant for the same flag, across application restarts and multiple server instances.
- Support attribute-based targeting rules with a rich set of comparison operators: `equals`, `notEquals`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`, `matches` (regex), `semverEquals`, `semverGreaterThan`, `semverLessThan`. Rules evaluate against user context attributes.
- Support reusable segments (named groups of targeting rules) that can be referenced by multiple flags. A segment like `"enterprise-users"` defined once with `{ attribute: "plan", operator: "in", values: ["enterprise", "business"] }` can be referenced in any flag's targeting rules.
- Evaluate rules with first-match semantics: rules are evaluated in order, and the first matching rule determines the variant. If no rule matches, the flag's default variant is served. This matches the evaluation model used by LaunchDarkly, Unleash, and PostHog.
- Support hot reload of configuration without application restart. The client watches the configuration file for changes and emits events when flag definitions change. Running applications pick up new flag values on the next evaluation after a file change.
- Provide typed convenience methods for AI-specific use cases: `client.getPrompt(flagKey, context)` returns a prompt string, `client.getModel(flagKey, context)` returns a `{ model, temperature, maxTokens, topP, ... }` object, `client.getConfig(flagKey, context)` returns typed JSON.
- Emit evaluation events (`onEvaluation` hook) with flag key, resolved variant, context, and timestamp, enabling integration with analytics, logging, and observability pipelines.
- Provide a CLI (`prompt-flags`) for listing flags, evaluating flags with test contexts, validating configuration files, and inspecting rollout distributions.
- Keep dependencies minimal: one runtime dependency (`murmurhash3js` for deterministic hashing). All other functionality uses Node.js built-ins.
- Integrate with sibling packages in the ecosystem: `prompt-version` for versioned prompt content, `prompt-drift` for monitoring prompt changes, and `prompt-inherit` for composable prompt construction.

### Non-Goals

- **Not a hosted feature flag platform.** This package does not provide a server, dashboard, API endpoint, or persistent storage. It is a local library and CLI. Teams that want a managed feature flag platform should use LaunchDarkly, Unleash, GrowthBook, or similar services. `prompt-flags` is for teams that want flag evaluation in their application process with configuration in their git repository.
- **Not a prompt management system.** This package does not store, version, edit, or deploy prompts. It routes to prompt variants based on flag rules. Use `prompt-version` for prompt versioning and lifecycle management. `prompt-flags` references prompt content by embedding it in flag variant values or by returning identifiers that the application resolves against a prompt registry.
- **Not a prompt evaluation or testing framework.** This package does not execute prompts against models, compare outputs, or score quality. That is what promptfoo and Braintrust do. `prompt-flags` determines which variant to serve; evaluation of variant quality is a separate concern.
- **Not an A/B testing analytics platform.** This package emits evaluation events but does not collect them, compute statistical significance, or visualize experiment results. Pipe evaluation events to PostHog, Langfuse, Braintrust, or a custom analytics pipeline for experiment analysis.
- **Not an LLM client or proxy.** This package does not send requests to any model API. It resolves flag values that the caller uses to configure their own LLM client (OpenAI SDK, Anthropic SDK, Vercel AI SDK, LangChain, raw HTTP). `prompt-flags` decides what to send; the application decides how to send it.
- **Not a real-time synchronization system.** Hot reload watches a local file. There is no WebSocket streaming, no webhook ingestion endpoint, and no polling of remote configuration servers. Teams that need remote configuration push should use LaunchDarkly or implement a sidecar that writes the local configuration file from a remote source.
- **Not a general-purpose feature flag system.** This package is optimized for AI configuration use cases. It supports boolean, multivariate, and structured configuration flags, but it does not provide feature flag workflows like scheduled rollouts with calendar integration, approval gates, change management audit trails, or SSO-gated flag changes. Use a full feature flag platform for those workflows.

---

## 3. Target Users and Use Cases

### AI Application Development Teams

Teams building production applications powered by LLMs that need to control prompt and model configuration at runtime without redeploying code. A customer support application serves a system prompt, calls a specific model, and uses specific parameter settings. The team wants to test a new prompt variant on 10% of users, compare quality metrics, and ramp up to 100% if the new variant performs better. Running `client.getPrompt("support-prompt", { userId: "user-123", plan: "enterprise" })` returns the appropriate prompt variant based on the user's segment and the flag's rollout percentage. This is the primary audience.

### Teams Running Prompt A/B Tests

Teams that need to split traffic between prompt variants to measure quality, cost, or latency differences. A prompt for summarization exists in two variants: "concise" (shorter, cheaper, faster) and "detailed" (longer, more thorough, higher token cost). The flag allocates 50% of users to each variant. Evaluation events are piped to an analytics system to compare response quality scores. After one week, the team adjusts the allocation to 80/20 in favor of the winning variant by editing the configuration file, with no code change or deployment.

### Teams Performing Gradual Model Migration

Teams migrating from one model to another (e.g., GPT-4o to Claude Sonnet) and wanting to roll out the new model gradually. A `model` flag starts with 100% on GPT-4o. The team changes the configuration to 5% Claude Sonnet / 95% GPT-4o, monitors error rates and quality, then ramps to 25%, 50%, and finally 100%. Each step is a configuration file edit, reviewed in a pull request, merged, and picked up by hot reload. Deterministic bucketing ensures that the same 5% of users who received Claude Sonnet at the first step continue to receive it at 25% -- no user sees random variant switching.

### Teams with Per-Segment Configuration

Teams that need different AI configurations for different user segments. Enterprise customers receive GPT-4o with temperature 0.2 for precise, reliable responses. Free-tier users receive GPT-4o-mini with temperature 0.5 for cost-effective responses. Internal testers receive Claude Sonnet with temperature 0.0 for deterministic evaluation. Each segment is defined once and referenced across multiple flags. Changing the enterprise model from GPT-4o to a newer version is a single-line configuration change.

### Platform Teams Managing Shared AI Configuration

Teams that maintain a centralized AI configuration consumed by multiple services. The configuration file defines the approved models, parameter ranges, and prompt variants for the organization. Application teams reference flags by key. When the platform team approves a new model, they add it as a variant and set an initial rollout percentage. This provides governance without coupling every application team to a specific model or prompt version.

### DevOps Teams Needing Kill Switches

Teams that need the ability to instantly revert AI configuration when something goes wrong. A boolean kill switch flag (`"use-new-summarizer"`) is set to `true` during normal operation. When monitoring detects quality degradation, an engineer sets the flag to `false` in the configuration file. Hot reload picks up the change within seconds. All subsequent evaluations return `false`, and the application falls back to the previous summarizer. No deployment, no restart.

### Solo Developers and Small Teams

Individual developers building AI features who want structured configuration management without the overhead of a hosted platform. Installing `prompt-flags`, creating a `flags.json` file, and calling `client.getPrompt("greeting", { userId })` takes five minutes and immediately provides deterministic variant routing, percentage rollout capability, and a clean separation between configuration and application logic.

---

## 4. Core Concepts

### Flag

A flag is a named configuration decision point in an AI application. Each flag has a unique key (e.g., `"support-prompt"`, `"model-selection"`, `"temperature-config"`), a type that determines the shape of its resolved value, a set of named variants, targeting rules that map user contexts to variants, and a default variant that is served when no targeting rule matches.

A flag answers the question: "For this user, in this context, what configuration should I use?" The answer is one of the flag's named variants, selected by evaluating targeting rules against the user's context attributes and applying percentage-based rollout.

### Variant

A variant is a named possible value of a flag. Each variant has a unique name within its flag (e.g., `"control"`, `"variant-a"`, `"concise"`, `"detailed"`) and a value whose shape depends on the flag type. For a `prompt` flag, the variant value is a string. For a `model` flag, the variant value is an object containing a model name and parameters. For a `config` flag, the variant value is arbitrary JSON. For a `boolean` flag, the variant values are `true` and `false`.

Variants are the atoms of flag evaluation. Every evaluation resolves to exactly one variant. Targeting rules and percentage rollouts determine which variant is selected for a given user context.

### Evaluation Context

The evaluation context is the set of attributes describing the entity (user, request, session) for which a flag is being evaluated. The context is passed to every `evaluate()`, `getPrompt()`, `getModel()`, `getConfig()`, and `isEnabled()` call. It is the input against which targeting rules are evaluated and from which the bucketing key is derived for percentage rollout.

The context must include a `key` field -- a unique, stable identifier for the entity (typically a user ID). The `key` is used as the input to the hash function for deterministic bucketing. Without a `key`, percentage rollouts cannot be deterministic, and the client generates a random assignment that does not persist across evaluations.

Additional context attributes are optional and used for targeting: `plan`, `region`, `language`, `email`, `organization`, `role`, `device`, and arbitrary custom attributes. Attributes can be strings, numbers, booleans, or arrays of strings (for `in`/`notIn` operators).

```typescript
const context: EvaluationContext = {
  key: 'user-abc-123',                  // Required: stable identifier for bucketing
  plan: 'enterprise',                    // Optional: used in targeting rules
  region: 'us-east',                     // Optional: used in targeting rules
  language: 'en',                        // Optional: used in targeting rules
  organization: 'acme-corp',            // Optional: used in targeting rules
  custom: {                              // Optional: arbitrary attributes
    signupDate: '2025-06-15',
    betaTester: true,
    requestCount: 50000,
  },
};
```

### Targeting Rule

A targeting rule is a conditional expression that maps matching contexts to a specific variant or percentage rollout. Rules are defined in the flag configuration and evaluated in order. The first rule whose conditions match the evaluation context determines the result.

Each rule consists of one or more conditions (evaluated with AND logic -- all conditions must be true for the rule to match), and either a fixed variant to serve or a percentage rollout across multiple variants. Rules can also reference segments instead of inline conditions.

```json
{
  "conditions": [
    { "attribute": "plan", "operator": "in", "values": ["enterprise", "business"] },
    { "attribute": "region", "operator": "equals", "value": "us-east" }
  ],
  "serve": { "variant": "premium-model" }
}
```

This rule matches contexts where `plan` is "enterprise" or "business" AND `region` is "us-east", and serves the `"premium-model"` variant. If the context does not match, evaluation proceeds to the next rule.

The first-match-wins evaluation model means rule ordering matters. More specific rules should appear before more general rules. This is the same evaluation model used by LaunchDarkly, Unleash, PostHog, and most feature flag systems.

### Segment

A segment is a named, reusable group of targeting conditions. Segments allow you to define user groups once (e.g., `"enterprise-users"`, `"beta-testers"`, `"internal-team"`) and reference them in multiple flags without duplicating conditions. When a segment's definition changes, all flags referencing that segment automatically pick up the new definition.

Segments are defined at the top level of the configuration file, alongside flag definitions. A targeting rule can reference a segment by name instead of (or in addition to) inline conditions.

```json
{
  "segments": {
    "enterprise-users": {
      "description": "Users on enterprise or business plans",
      "conditions": [
        { "attribute": "plan", "operator": "in", "values": ["enterprise", "business"] }
      ]
    },
    "beta-testers": {
      "description": "Users opted into the beta program",
      "conditions": [
        { "attribute": "custom.betaTester", "operator": "equals", "value": true }
      ]
    }
  }
}
```

### Percentage Rollout

A percentage rollout distributes evaluation results across multiple variants according to configured weights. Instead of serving a single fixed variant, a rule serves variant A to X% of users and variant B to (100-X)% of users. The assignment is deterministic: the same user always receives the same variant for the same flag.

Deterministic assignment is achieved through consistent hashing. The client computes `murmurhash3(context.key + flagKey) % 10000`, producing a bucket value between 0 and 9999 (0.01% granularity). Variant allocation ranges are defined by cumulative weight boundaries. If variant A has weight 30 (30%) and variant B has weight 70 (70%), buckets 0-2999 map to variant A and buckets 3000-9999 map to variant B.

The use of both `context.key` and `flagKey` as hash input ensures that a user's assignment is independent across flags. A user who is in the 5% group for flag X is not necessarily in the 5% group for flag Y. This is critical for A/B testing: flag assignments must be statistically independent to avoid confounding.

```json
{
  "conditions": [],
  "serve": {
    "rollout": [
      { "variant": "control", "weight": 70 },
      { "variant": "new-prompt", "weight": 30 }
    ]
  }
}
```

### Default Variant

The default variant is served when no targeting rule matches the evaluation context. Every flag must declare a default variant. The default is also served when the flag is disabled (toggled off), when the context is missing or invalid, or when an error occurs during rule evaluation (fail-safe behavior).

The default variant acts as the production-safe baseline. During a gradual rollout, the default is typically the existing production behavior, and targeting rules introduce the new behavior to a subset of users.

### Flag Types

`prompt-flags` defines four flag types that reflect the configuration decisions in AI applications:

| Flag Type | Value Shape | Use Case |
|-----------|-------------|----------|
| `prompt` | `string` | Prompt text, system message content, prompt template |
| `model` | `{ model: string, temperature?: number, maxTokens?: number, topP?: number, frequencyPenalty?: number, presencePenalty?: number, stop?: string[], [key: string]: unknown }` | Model name plus LLM parameters |
| `config` | `Record<string, unknown>` (arbitrary JSON) | Arbitrary AI feature configuration: tool definitions, few-shot examples, output schemas, guardrail settings |
| `boolean` | `boolean` | On/off kill switches, feature gates |

Flag types are enforced at configuration validation time. A `prompt` flag's variant values must be strings. A `model` flag's variant values must be objects with a `model` string field. A `boolean` flag must have exactly two variants with values `true` and `false`. A `config` flag's variant values must be JSON objects.

---

## 5. Flag Types

### 5.1 Prompt Flag

A prompt flag returns a prompt string variant. This is the most common flag type for AI applications. Prompt flags are used to A/B test prompt wording, gradually roll out new prompt versions, and serve different prompts to different user segments.

Variant values are strings containing the prompt text. The text can be a plain system prompt, a message template with `{{variable}}` placeholders, or a reference to a prompt version in `prompt-version` (e.g., `"greeting@^2.0.0"` -- resolved by the application, not by `prompt-flags`).

```json
{
  "key": "support-prompt",
  "type": "prompt",
  "description": "Customer support system prompt",
  "enabled": true,
  "variants": {
    "v1": {
      "value": "You are a helpful customer support agent for ACME Corp. Answer questions about our products clearly and concisely. If you don't know the answer, say so honestly."
    },
    "v2": {
      "value": "You are an expert customer support specialist for ACME Corp. Your goal is to resolve the customer's issue in a single interaction. Use a warm, professional tone. Provide specific product details when relevant. If the issue requires escalation, explain the next steps clearly."
    }
  },
  "defaultVariant": "v1",
  "rules": [
    {
      "conditions": [],
      "serve": {
        "rollout": [
          { "variant": "v1", "weight": 80 },
          { "variant": "v2", "weight": 20 }
        ]
      }
    }
  ]
}
```

**API usage:**

```typescript
const prompt = client.getPrompt('support-prompt', { key: 'user-123', plan: 'enterprise' });
// Returns: "You are an expert customer support specialist for ACME Corp. ..."
```

### 5.2 Model Flag

A model flag returns a model configuration object containing the model name and LLM parameters. Model flags are used for gradual model migration, per-segment model selection, and parameter tuning experiments.

Variant values are objects with a required `model` string field and optional parameter fields. The parameter fields are not prescriptive -- any key-value pairs are allowed to accommodate different LLM providers with different parameter names. However, the common parameters (`temperature`, `maxTokens`, `topP`, `frequencyPenalty`, `presencePenalty`, `stop`) are typed in the TypeScript interface for IntelliSense support.

```json
{
  "key": "model-selection",
  "type": "model",
  "description": "Model and parameter selection for the main chat feature",
  "enabled": true,
  "variants": {
    "gpt4o": {
      "value": {
        "model": "gpt-4o",
        "temperature": 0.3,
        "maxTokens": 2048,
        "topP": 0.95
      }
    },
    "claude-sonnet": {
      "value": {
        "model": "claude-sonnet-4-20250514",
        "temperature": 0.3,
        "maxTokens": 2048,
        "topP": 0.95
      }
    },
    "gpt4o-mini": {
      "value": {
        "model": "gpt-4o-mini",
        "temperature": 0.5,
        "maxTokens": 1024
      }
    }
  },
  "defaultVariant": "gpt4o",
  "rules": [
    {
      "description": "Enterprise users get GPT-4o",
      "segment": "enterprise-users",
      "serve": { "variant": "gpt4o" }
    },
    {
      "description": "Gradual migration to Claude Sonnet for standard users",
      "conditions": [
        { "attribute": "plan", "operator": "in", "values": ["pro", "standard"] }
      ],
      "serve": {
        "rollout": [
          { "variant": "gpt4o", "weight": 90 },
          { "variant": "claude-sonnet", "weight": 10 }
        ]
      }
    },
    {
      "description": "Free tier users get GPT-4o-mini",
      "conditions": [
        { "attribute": "plan", "operator": "equals", "value": "free" }
      ],
      "serve": { "variant": "gpt4o-mini" }
    }
  ]
}
```

**API usage:**

```typescript
const config = client.getModel('model-selection', { key: 'user-456', plan: 'pro' });
// Returns: { model: 'gpt-4o', temperature: 0.3, maxTokens: 2048, topP: 0.95 }
// (or claude-sonnet config for 10% of pro/standard users)

// Use with OpenAI SDK:
const completion = await openai.chat.completions.create({
  model: config.model,
  temperature: config.temperature,
  max_tokens: config.maxTokens,
  messages: [{ role: 'system', content: prompt }],
});
```

### 5.3 Config Flag

A config flag returns arbitrary JSON configuration for AI features. Config flags are the most flexible type, used for complex configuration that does not fit the prompt or model types: tool definitions, output schemas, few-shot example sets, guardrail parameters, retrieval settings, and multi-field configurations that bundle several concerns.

Variant values are JSON objects with any structure. The TypeScript API supports generic types for type-safe access.

```json
{
  "key": "rag-config",
  "type": "config",
  "description": "RAG retrieval and generation settings",
  "enabled": true,
  "variants": {
    "conservative": {
      "value": {
        "retrievalTopK": 3,
        "retrievalMinScore": 0.85,
        "maxContextTokens": 2000,
        "includeSourceCitations": true,
        "fallbackBehavior": "refuse"
      }
    },
    "aggressive": {
      "value": {
        "retrievalTopK": 10,
        "retrievalMinScore": 0.70,
        "maxContextTokens": 6000,
        "includeSourceCitations": true,
        "fallbackBehavior": "synthesize"
      }
    }
  },
  "defaultVariant": "conservative",
  "rules": [
    {
      "conditions": [
        { "attribute": "custom.betaTester", "operator": "equals", "value": true }
      ],
      "serve": { "variant": "aggressive" }
    }
  ]
}
```

**API usage:**

```typescript
interface RAGConfig {
  retrievalTopK: number;
  retrievalMinScore: number;
  maxContextTokens: number;
  includeSourceCitations: boolean;
  fallbackBehavior: 'refuse' | 'synthesize';
}

const ragConfig = client.getConfig<RAGConfig>('rag-config', context);
// Returns typed RAGConfig object
```

### 5.4 Boolean Flag

A boolean flag is a simple on/off switch. Boolean flags are used for kill switches, feature gates, and binary decisions. They always have exactly two variants: `"on"` (value `true`) and `"off"` (value `false`).

Boolean flags are syntactic sugar for a multivariate flag with two boolean variants. The `isEnabled()` convenience method resolves a boolean flag and returns the boolean value directly.

```json
{
  "key": "use-new-summarizer",
  "type": "boolean",
  "description": "Kill switch for the new summarizer pipeline",
  "enabled": true,
  "variants": {
    "on": { "value": true },
    "off": { "value": false }
  },
  "defaultVariant": "on",
  "rules": [
    {
      "description": "Disable for users in EU region during rollout",
      "conditions": [
        { "attribute": "region", "operator": "in", "values": ["eu-west", "eu-central"] }
      ],
      "serve": { "variant": "off" }
    }
  ]
}
```

**API usage:**

```typescript
const enabled = client.isEnabled('use-new-summarizer', context);
if (enabled) {
  // Use new summarizer
} else {
  // Fall back to old summarizer
}
```

---

## 6. Targeting Rules

### Rule Structure

A targeting rule consists of conditions that must be satisfied for the rule to match, and a serve directive that specifies the variant or rollout to return when the rule matches. Rules are evaluated in the order they appear in the flag's `rules` array. The first matching rule wins.

```typescript
interface TargetingRule {
  /** Human-readable description of the rule's purpose (optional). */
  description?: string;

  /**
   * Inline conditions. All conditions must be true (AND logic).
   * Omit or set to empty array for a rule that matches all contexts.
   */
  conditions?: RuleCondition[];

  /**
   * Reference to a named segment. When provided, the segment's
   * conditions are used instead of (or in addition to) inline conditions.
   */
  segment?: string;

  /** What to serve when the rule matches. */
  serve: ServeDirective;
}

interface RuleCondition {
  /** The context attribute to evaluate (dot notation for nested attributes). */
  attribute: string;

  /** The comparison operator. */
  operator: ComparisonOperator;

  /** The value(s) to compare against. */
  value?: string | number | boolean;

  /** For operators that compare against a set (in, notIn). */
  values?: Array<string | number>;

  /** Negate the condition (logical NOT). */
  negate?: boolean;
}

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
  | 'notExists'
  | 'semverEquals'
  | 'semverGreaterThan'
  | 'semverLessThan';

type ServeDirective =
  | { variant: string }                                  // Fixed variant
  | { rollout: Array<{ variant: string; weight: number }> };  // Percentage rollout
```

### Operators

| Operator | Description | Value Type | Example |
|----------|-------------|------------|---------|
| `equals` | Exact equality comparison. | `string \| number \| boolean` | `{ attribute: "plan", operator: "equals", value: "enterprise" }` |
| `notEquals` | Not equal. | `string \| number \| boolean` | `{ attribute: "plan", operator: "notEquals", value: "free" }` |
| `in` | Value is in the provided set. | `Array<string \| number>` | `{ attribute: "region", operator: "in", values: ["us-east", "us-west"] }` |
| `notIn` | Value is not in the provided set. | `Array<string \| number>` | `{ attribute: "region", operator: "notIn", values: ["cn-east", "cn-north"] }` |
| `contains` | String contains substring. | `string` | `{ attribute: "email", operator: "contains", value: "@acme.com" }` |
| `startsWith` | String starts with prefix. | `string` | `{ attribute: "key", operator: "startsWith", value: "internal-" }` |
| `endsWith` | String ends with suffix. | `string` | `{ attribute: "email", operator: "endsWith", value: "@test.com" }` |
| `greaterThan` | Numeric greater-than. | `number` | `{ attribute: "custom.requestCount", operator: "greaterThan", value: 10000 }` |
| `lessThan` | Numeric less-than. | `number` | `{ attribute: "custom.requestCount", operator: "lessThan", value: 100 }` |
| `greaterThanOrEqual` | Numeric greater-than-or-equal. | `number` | `{ attribute: "custom.requestCount", operator: "greaterThanOrEqual", value: 5000 }` |
| `lessThanOrEqual` | Numeric less-than-or-equal. | `number` | `{ attribute: "custom.requestCount", operator: "lessThanOrEqual", value: 500 }` |
| `matches` | Regex match. | `string` (regex pattern) | `{ attribute: "email", operator: "matches", value: "^.*@acme\\.com$" }` |
| `exists` | Attribute is present and not null/undefined. | (none) | `{ attribute: "custom.betaTester", operator: "exists" }` |
| `notExists` | Attribute is absent or null/undefined. | (none) | `{ attribute: "custom.optedOut", operator: "notExists" }` |
| `semverEquals` | Semver equality. | `string` | `{ attribute: "custom.appVersion", operator: "semverEquals", value: "2.0.0" }` |
| `semverGreaterThan` | Semver greater-than. | `string` | `{ attribute: "custom.appVersion", operator: "semverGreaterThan", value: "1.5.0" }` |
| `semverLessThan` | Semver less-than. | `string` | `{ attribute: "custom.appVersion", operator: "semverLessThan", value: "3.0.0" }` |

### Rule Evaluation Logic

Within a single rule, conditions are combined with AND logic: all conditions must be true for the rule to match. Across rules, evaluation follows first-match-wins: rules are evaluated top to bottom, and the first rule whose conditions all match determines the result.

This means OR logic is expressed by having multiple rules with the same serve directive. For example, "serve variant A to enterprise users OR to beta testers" is expressed as two rules: one targeting the `enterprise-users` segment and one targeting `custom.betaTester`.

### Condition Evaluation Against Context

When a condition references an attribute that is not present in the context:

- `exists` returns `false`.
- `notExists` returns `true`.
- All other operators return `false` (the condition does not match). This is fail-safe: missing attributes never accidentally match targeting rules.

When a condition references a nested attribute (e.g., `"custom.betaTester"`), the attribute path is resolved using dot notation against the context object. The context `{ key: "u1", custom: { betaTester: true } }` satisfies the condition `{ attribute: "custom.betaTester", operator: "equals", value: true }`.

### Segment Reference in Rules

A targeting rule can reference a segment by name. When a segment is referenced, the segment's conditions are evaluated as if they were inline conditions in the rule. If the rule also has inline conditions, both the segment conditions and the inline conditions must all be true (AND logic).

```json
{
  "segment": "enterprise-users",
  "conditions": [
    { "attribute": "region", "operator": "equals", "value": "us-east" }
  ],
  "serve": { "variant": "premium-model" }
}
```

This rule matches contexts that belong to the `enterprise-users` segment AND have `region` equal to `"us-east"`.

### Default Fallback

If no rule matches the context, the flag's `defaultVariant` is served. If the `defaultVariant` is a rollout (not a fixed variant), the percentage rollout is applied. The default variant is also served when:

- The flag is disabled (`enabled: false`).
- The context is `null` or `undefined` (with a warning emitted).
- An error occurs during rule evaluation (with an error event emitted).

---

## 7. Rollout Strategies

### Percentage Rollout

Percentage rollout distributes users across variants according to configured weights. Weights are integers that represent relative proportions. The sum of all weights in a rollout determines the total allocation space, but weights are normalized to 10000 buckets internally. By convention, weights should sum to 100 (representing percentages), but the system normalizes any sum.

**Deterministic bucketing algorithm:**

1. Compute `hashInput = context.key + "/" + flagKey`.
2. Compute `hash = murmurhash3_x86_32(hashInput)`.
3. Compute `bucket = hash % 10000` (value between 0 and 9999, giving 0.01% granularity).
4. Normalize variant weights: compute `totalWeight = sum of all weights`.
5. For each variant in order, compute the cumulative weight boundary: `boundary = cumulativeWeight * 10000 / totalWeight`.
6. The variant whose boundary first exceeds the bucket value is selected.

**Example:** Rollout `[{ variant: "control", weight: 70 }, { variant: "new-prompt", weight: 30 }]`:
- `totalWeight = 100`
- Control boundary: `70 * 10000 / 100 = 7000`. Buckets 0-6999 get "control".
- New-prompt boundary: `100 * 10000 / 100 = 10000`. Buckets 7000-9999 get "new-prompt".

**Properties of this algorithm:**

- **Deterministic**: The same `context.key` + `flagKey` always produces the same bucket. A user who gets "control" today gets "control" tomorrow, on a different server, after a restart.
- **Independent across flags**: Because `flagKey` is part of the hash input, a user's bucket for flag A is unrelated to their bucket for flag B. This prevents correlated assignment across experiments.
- **Stable during ramp-up**: When the rollout percentage increases from 10% to 30%, the users who were already in the 10% group remain in their variant. Only new users (from the 10-30% range) are added. This is because bucket boundaries move outward, never inward.
- **Uniform distribution**: MurmurHash3 produces uniformly distributed hashes, so variants receive traffic proportional to their weights with high accuracy (within 0.5% for populations over 10,000 users).

### Targeted Rollout

A targeted rollout serves a specific variant to contexts matching targeting conditions, without percentage splitting. This is the simplest rollout strategy: the rule matches and serves a fixed variant.

```json
{
  "conditions": [
    { "attribute": "plan", "operator": "equals", "value": "enterprise" }
  ],
  "serve": { "variant": "premium-model" }
}
```

All enterprise users receive `"premium-model"`. No bucketing is needed. This is used for segment-based configuration (all users in a segment get the same treatment) and for individual user targeting (targeting specific user IDs for debugging or VIP treatment).

### Combined Targeting and Rollout

Rules can combine targeting conditions with percentage rollout. This enables "gradual rollout within a segment" -- for example, rolling out a new prompt to 20% of enterprise users while keeping 80% on the existing prompt.

```json
{
  "segment": "enterprise-users",
  "serve": {
    "rollout": [
      { "variant": "v1", "weight": 80 },
      { "variant": "v2", "weight": 20 }
    ]
  }
}
```

### Ramp-Up Pattern

Gradual rollout from 0% to 100% is achieved by editing the rollout weights in the configuration file over time. This is a configuration workflow, not a built-in scheduling feature.

**Day 1 (initial canary):**
```json
{ "rollout": [{ "variant": "control", "weight": 95 }, { "variant": "new-prompt", "weight": 5 }] }
```

**Day 3 (expand after monitoring):**
```json
{ "rollout": [{ "variant": "control", "weight": 75 }, { "variant": "new-prompt", "weight": 25 }] }
```

**Day 7 (broad rollout):**
```json
{ "rollout": [{ "variant": "control", "weight": 50 }, { "variant": "new-prompt", "weight": 50 }] }
```

**Day 14 (full rollout):**
```json
{ "rollout": [{ "variant": "new-prompt", "weight": 100 }] }
```

Because of the stable bucketing property, users who were in the 5% group on Day 1 remain in the "new-prompt" variant throughout the ramp-up. They never experience variant switching.

### Kill Switch Pattern

A kill switch is a boolean flag that defaults to `"on"` and can be set to `"off"` to instantly disable a feature. The fastest way to revert is to set `"enabled": false` on the flag, which causes all evaluations to return the `defaultVariant`. Alternatively, remove or modify the targeting rules.

Kill switches are designed for emergency response. An engineer edits the configuration file, commits, and pushes. If hot reload is enabled, the application picks up the change within the file watcher debounce interval (default: 500ms). If hot reload is not enabled, the application is restarted.

---

## 8. API Surface

### Installation

```bash
npm install prompt-flags
```

### Main Export: `createClient`

The primary API is a factory function that creates a `FlagClient` from a configuration object.

```typescript
import { createClient } from 'prompt-flags';

const client = createClient({
  configPath: './flags.json',
});

const prompt = client.getPrompt('support-prompt', { key: 'user-123', plan: 'enterprise' });
const model = client.getModel('model-selection', { key: 'user-123', plan: 'enterprise' });
const enabled = client.isEnabled('use-new-summarizer', { key: 'user-123' });
```

### Type Definitions

```typescript
// ── Client Configuration ────────────────────────────────────────────

/** Configuration for creating a FlagClient. */
interface FlagClientConfig {
  /**
   * Path to the flag configuration file (JSON or YAML).
   * Mutually exclusive with `config`.
   */
  configPath?: string;

  /**
   * Inline flag configuration object.
   * Mutually exclusive with `configPath`.
   */
  config?: FlagConfiguration;

  /**
   * Enable file watching for hot reload.
   * Only applicable when `configPath` is provided.
   * Default: false.
   */
  hotReload?: boolean;

  /**
   * Debounce interval (ms) for file change detection.
   * Default: 500.
   */
  hotReloadDebounceMs?: number;

  /**
   * Event handler called after every flag evaluation.
   * Receives the evaluation result with flag key, variant, context, and timestamp.
   */
  onEvaluation?: (event: EvaluationEvent) => void;

  /**
   * Event handler called when the configuration is reloaded.
   * Receives the list of flag keys that changed.
   */
  onConfigChange?: (event: ConfigChangeEvent) => void;

  /**
   * Event handler called when an error occurs during evaluation
   * or configuration loading. Defaults to console.error.
   */
  onError?: (error: FlagError) => void;

  /**
   * Default context attributes applied to every evaluation.
   * Per-evaluation context overrides these defaults.
   */
  defaultContext?: Partial<EvaluationContext>;

  /**
   * Environment name for environment-specific overrides.
   * When set, the client looks for environment-specific flag
   * values in the configuration (e.g., "production", "staging").
   */
  environment?: string;
}

// ── Evaluation Context ──────────────────────────────────────────────

/** Context describing the entity for which flags are evaluated. */
interface EvaluationContext {
  /** Unique, stable identifier for the entity (required for deterministic bucketing). */
  key: string;

  /** Plan or tier (e.g., "free", "pro", "enterprise"). */
  plan?: string;

  /** Geographic region (e.g., "us-east", "eu-west"). */
  region?: string;

  /** Language code (e.g., "en", "ja", "es"). */
  language?: string;

  /** Email address (for individual targeting or domain matching). */
  email?: string;

  /** Organization or team identifier. */
  organization?: string;

  /** User role (e.g., "admin", "developer", "viewer"). */
  role?: string;

  /** Arbitrary custom attributes. Supports nested objects with dot-notation access. */
  custom?: Record<string, string | number | boolean | string[]>;
}

// ── Flag Types ──────────────────────────────────────────────────────

/** Model configuration returned by model flags. */
interface ModelConfig {
  /** The model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514"). */
  model: string;

  /** Sampling temperature. */
  temperature?: number;

  /** Maximum tokens in the response. */
  maxTokens?: number;

  /** Top-p (nucleus) sampling parameter. */
  topP?: number;

  /** Frequency penalty. */
  frequencyPenalty?: number;

  /** Presence penalty. */
  presencePenalty?: number;

  /** Stop sequences. */
  stop?: string[];

  /** Additional provider-specific parameters. */
  [key: string]: unknown;
}

// ── Evaluation Result ───────────────────────────────────────────────

/** The resolved result of evaluating a flag. */
interface EvaluationResult<T = unknown> {
  /** The flag key that was evaluated. */
  flagKey: string;

  /** The name of the resolved variant. */
  variantKey: string;

  /** The resolved variant value (typed by the flag type). */
  value: T;

  /** The reason the variant was selected. */
  reason: EvaluationReason;

  /** Whether the flag is enabled. */
  flagEnabled: boolean;
}

/**
 * The reason a specific variant was selected.
 * - 'rule_match': A targeting rule matched.
 * - 'default': No rule matched; default variant served.
 * - 'disabled': Flag is disabled; default variant served.
 * - 'error': An error occurred; default variant served.
 * - 'override': A test override was applied.
 */
type EvaluationReason = 'rule_match' | 'default' | 'disabled' | 'error' | 'override';

// ── Events ──────────────────────────────────────────────────────────

/** Emitted after every flag evaluation. */
interface EvaluationEvent {
  /** ISO 8601 timestamp. */
  timestamp: string;

  /** The flag key that was evaluated. */
  flagKey: string;

  /** The name of the resolved variant. */
  variantKey: string;

  /** The flag type. */
  flagType: 'prompt' | 'model' | 'config' | 'boolean';

  /** The evaluation reason. */
  reason: EvaluationReason;

  /** The context used for evaluation (key only, not full context, for privacy). */
  contextKey: string;

  /** The index of the matching rule, or -1 for default/disabled/error. */
  ruleIndex: number;
}

/** Emitted when the configuration file changes and is reloaded. */
interface ConfigChangeEvent {
  /** ISO 8601 timestamp. */
  timestamp: string;

  /** Flag keys that were added. */
  added: string[];

  /** Flag keys that were modified. */
  modified: string[];

  /** Flag keys that were removed. */
  removed: string[];
}
```

### FlagClient API

```typescript
/**
 * Create a flag client from configuration.
 * Loads the configuration file (if configPath is provided) and
 * returns a FlagClient ready for evaluation.
 *
 * Throws FlagConfigError if the configuration file does not exist,
 * cannot be parsed, or fails validation.
 */
function createClient(config: FlagClientConfig): FlagClient;

/** The flag client interface. */
interface FlagClient {
  // ── Typed Evaluation Methods ────────────────────────────────────

  /**
   * Evaluate a prompt flag and return the prompt string.
   * Throws FlagTypeMismatchError if the flag is not a prompt flag.
   * Throws FlagNotFoundError if the flag key does not exist.
   */
  getPrompt(flagKey: string, context: EvaluationContext): string;

  /**
   * Evaluate a model flag and return the model configuration.
   * Throws FlagTypeMismatchError if the flag is not a model flag.
   */
  getModel(flagKey: string, context: EvaluationContext): ModelConfig;

  /**
   * Evaluate a config flag and return the configuration object.
   * The generic type parameter enables typed access.
   * Throws FlagTypeMismatchError if the flag is not a config flag.
   */
  getConfig<T extends Record<string, unknown> = Record<string, unknown>>(
    flagKey: string,
    context: EvaluationContext,
  ): T;

  /**
   * Evaluate a boolean flag and return the boolean value.
   * Throws FlagTypeMismatchError if the flag is not a boolean flag.
   */
  isEnabled(flagKey: string, context: EvaluationContext): boolean;

  // ── Generic Evaluation ──────────────────────────────────────────

  /**
   * Evaluate any flag and return the full evaluation result.
   * Works for all flag types. Returns the variant key, value,
   * evaluation reason, and flag status.
   */
  evaluate<T = unknown>(flagKey: string, context: EvaluationContext): EvaluationResult<T>;

  /**
   * Evaluate all flags for a given context and return a map
   * of flag keys to evaluation results.
   */
  allFlags(context: EvaluationContext): Record<string, EvaluationResult>;

  // ── Inspection ──────────────────────────────────────────────────

  /** List all flag keys in the configuration. */
  getFlagKeys(): string[];

  /** Get the flag definition for a specific key, or null if not found. */
  getFlag(flagKey: string): FlagDefinition | null;

  /** Get all segment definitions. */
  getSegments(): Record<string, SegmentDefinition>;

  // ── Test Support ────────────────────────────────────────────────

  /**
   * Override a flag's evaluation to always return a specific variant,
   * regardless of targeting rules. Used for testing.
   * Call clearOverride() or clearAllOverrides() to remove.
   */
  overrideForTest(flagKey: string, variantKey: string): void;

  /**
   * Override a flag's evaluation to always return a specific value,
   * regardless of targeting rules. Used for testing when you want
   * to set a value that may not correspond to a defined variant.
   */
  overrideValueForTest(flagKey: string, value: unknown): void;

  /** Remove a test override for a specific flag. */
  clearOverride(flagKey: string): void;

  /** Remove all test overrides. */
  clearAllOverrides(): void;

  // ── Lifecycle ───────────────────────────────────────────────────

  /**
   * Reload the configuration from the file.
   * Automatically called by hot reload when the file changes.
   * Can be called manually to force a refresh.
   */
  reload(): void;

  /**
   * Shut down the client: stop file watching, release resources.
   * After dispose(), all evaluation methods throw.
   */
  dispose(): void;
}
```

### Error Classes

```typescript
/** Base error for all prompt-flags errors. */
class FlagError extends Error {
  readonly code: string;
}

/** Thrown when a flag key is not found in the configuration. */
class FlagNotFoundError extends FlagError {
  readonly code = 'FLAG_NOT_FOUND';
  readonly flagKey: string;
}

/** Thrown when a typed method is called on a flag of the wrong type. */
class FlagTypeMismatchError extends FlagError {
  readonly code = 'FLAG_TYPE_MISMATCH';
  readonly flagKey: string;
  readonly expectedType: string;
  readonly actualType: string;
}

/** Thrown when the configuration file is invalid. */
class FlagConfigError extends FlagError {
  readonly code = 'FLAG_CONFIG_ERROR';
  readonly configPath?: string;
  readonly validationErrors: string[];
}

/** Thrown when a variant referenced in a rule does not exist. */
class VariantNotFoundError extends FlagError {
  readonly code = 'VARIANT_NOT_FOUND';
  readonly flagKey: string;
  readonly variantKey: string;
}

/** Thrown when a segment referenced in a rule does not exist. */
class SegmentNotFoundError extends FlagError {
  readonly code = 'SEGMENT_NOT_FOUND';
  readonly flagKey: string;
  readonly segmentKey: string;
}

/** Thrown when the client has been disposed. */
class ClientDisposedError extends FlagError {
  readonly code = 'CLIENT_DISPOSED';
}
```

### Example: Basic Usage

```typescript
import { createClient } from 'prompt-flags';

const client = createClient({
  configPath: './flags.json',
  onEvaluation: (event) => {
    console.log(`Flag ${event.flagKey} resolved to ${event.variantKey} for ${event.contextKey}`);
  },
});

const context = { key: 'user-123', plan: 'enterprise', region: 'us-east' };

// Get a prompt variant
const systemPrompt = client.getPrompt('support-prompt', context);

// Get model configuration
const modelConfig = client.getModel('model-selection', context);

// Check a kill switch
if (client.isEnabled('use-new-summarizer', context)) {
  // Use new summarizer
}

// Get arbitrary configuration
const ragConfig = client.getConfig('rag-config', context);

// Evaluate all flags at once
const allFlags = client.allFlags(context);
```

### Example: Integration with OpenAI SDK

```typescript
import { createClient } from 'prompt-flags';
import OpenAI from 'openai';

const flags = createClient({ configPath: './flags.json' });
const openai = new OpenAI();

async function handleChat(userId: string, userPlan: string, userMessage: string) {
  const context = { key: userId, plan: userPlan };

  const systemPrompt = flags.getPrompt('chat-system-prompt', context);
  const { model, temperature, maxTokens } = flags.getModel('chat-model', context);

  const response = await openai.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  return response.choices[0].message.content;
}
```

---

## 9. Evaluation Context

### Required Fields

| Field | Type | Purpose |
|-------|------|---------|
| `key` | `string` | Unique, stable identifier for the entity. Used as the hash input for deterministic bucketing. Typically a user ID, session ID, or organization ID. |

The `key` field is the only required field. Without it, percentage rollouts cannot be deterministic. If `key` is missing, the client logs a warning and generates a random key for the evaluation, which means the same entity may receive different variants on subsequent evaluations.

### Standard Optional Fields

| Field | Type | Typical Values | Purpose |
|-------|------|----------------|---------|
| `plan` | `string` | `"free"`, `"pro"`, `"enterprise"` | Subscription tier for segment targeting. |
| `region` | `string` | `"us-east"`, `"eu-west"`, `"ap-south"` | Geographic region for compliance or latency-based targeting. |
| `language` | `string` | `"en"`, `"ja"`, `"es"`, `"de"` | Language preference for locale-aware prompts. |
| `email` | `string` | `"alice@acme.com"` | Email for individual or domain-based targeting. |
| `organization` | `string` | `"acme-corp"`, `"globex"` | Organization for team-based targeting. |
| `role` | `string` | `"admin"`, `"developer"`, `"viewer"` | User role for permission-based targeting. |

### Custom Attributes

The `custom` field accepts arbitrary key-value pairs. Values can be strings, numbers, booleans, or arrays of strings. Custom attributes are accessed in targeting rules using dot notation: `"custom.betaTester"`, `"custom.requestCount"`, `"custom.signupDate"`.

```typescript
const context: EvaluationContext = {
  key: 'user-789',
  plan: 'enterprise',
  custom: {
    betaTester: true,
    requestCount: 50000,
    signupDate: '2024-06-15',
    enabledFeatures: ['rag', 'agents', 'tools'],
    appVersion: '2.3.1',
  },
};
```

### Anonymous Contexts

For anonymous users (no stable identifier), pass a session-specific or request-specific identifier as the `key`. The assignment will be consistent for the duration of the session but will change between sessions. Alternatively, pass an empty string as the `key`, which causes the client to generate a random key and log a warning.

```typescript
// Anonymous user with session ID
const context = { key: `session-${sessionId}` };

// Fully anonymous (random assignment each time -- not recommended for experiments)
const context = { key: '' };
```

### Default Context

A default context can be set at client creation time. Per-evaluation context attributes override the defaults. This is useful for setting server-wide attributes (region, environment) that apply to all evaluations.

```typescript
const client = createClient({
  configPath: './flags.json',
  defaultContext: {
    region: 'us-east',
    custom: { appVersion: '2.3.1' },
  },
});

// Only key and plan needed per-evaluation; region and appVersion come from defaults
const prompt = client.getPrompt('support-prompt', { key: 'user-123', plan: 'enterprise' });
```

### Context Validation

The client performs minimal validation on the context:

- If `key` is missing or empty, a warning is emitted and a random key is generated.
- If `key` is not a string, it is coerced to a string via `String(key)`.
- If `custom` contains values that are not strings, numbers, booleans, or string arrays, a warning is emitted and those values are ignored during rule evaluation.
- If a condition references an attribute that does not exist in the context, the condition evaluates to `false` (fail-safe).

---

## 10. Configuration Format

### File Format

Flag configurations are stored in a single JSON file. The file path is passed to `createClient()` via the `configPath` option. The default location is `./flags.json` in the project root.

YAML format is also supported (`.yaml` or `.yml` extension), parsed by a minimal built-in YAML parser that handles the subset of YAML used for flag configuration (objects, arrays, strings, numbers, booleans). Complex YAML features (anchors, multi-document streams, custom tags) are not supported; use JSON for complex configurations.

### Configuration Structure

```json
{
  "version": 1,
  "description": "AI feature flags for the customer support application",
  "updatedAt": "2026-03-18T10:00:00.000Z",

  "segments": {
    "enterprise-users": {
      "description": "Users on enterprise or business plans",
      "conditions": [
        { "attribute": "plan", "operator": "in", "values": ["enterprise", "business"] }
      ]
    },
    "internal-team": {
      "description": "Internal employees and testers",
      "conditions": [
        { "attribute": "email", "operator": "endsWith", "value": "@acme-internal.com" }
      ]
    },
    "beta-testers": {
      "description": "Users who opted into the beta program",
      "conditions": [
        { "attribute": "custom.betaTester", "operator": "equals", "value": true }
      ]
    }
  },

  "flags": {
    "support-prompt": {
      "type": "prompt",
      "description": "Customer support system prompt",
      "enabled": true,
      "variants": {
        "v1": {
          "value": "You are a helpful customer support agent for ACME Corp."
        },
        "v2": {
          "value": "You are an expert customer support specialist for ACME Corp. Resolve the customer's issue in a single interaction."
        }
      },
      "defaultVariant": "v1",
      "rules": [
        {
          "description": "Internal team always gets v2",
          "segment": "internal-team",
          "serve": { "variant": "v2" }
        },
        {
          "description": "Gradual rollout of v2 to all users",
          "conditions": [],
          "serve": {
            "rollout": [
              { "variant": "v1", "weight": 80 },
              { "variant": "v2", "weight": 20 }
            ]
          }
        }
      ]
    },

    "model-selection": {
      "type": "model",
      "description": "Model and parameter configuration",
      "enabled": true,
      "variants": {
        "gpt4o": {
          "value": { "model": "gpt-4o", "temperature": 0.3, "maxTokens": 2048 }
        },
        "gpt4o-mini": {
          "value": { "model": "gpt-4o-mini", "temperature": 0.5, "maxTokens": 1024 }
        }
      },
      "defaultVariant": "gpt4o",
      "rules": [
        {
          "description": "Free tier gets mini model",
          "conditions": [
            { "attribute": "plan", "operator": "equals", "value": "free" }
          ],
          "serve": { "variant": "gpt4o-mini" }
        }
      ]
    },

    "use-new-summarizer": {
      "type": "boolean",
      "description": "Kill switch for the new summarizer",
      "enabled": true,
      "variants": {
        "on": { "value": true },
        "off": { "value": false }
      },
      "defaultVariant": "on",
      "rules": []
    }
  },

  "environments": {
    "staging": {
      "flags": {
        "support-prompt": {
          "rules": [
            {
              "description": "100% v2 in staging",
              "conditions": [],
              "serve": { "variant": "v2" }
            }
          ]
        }
      }
    }
  }
}
```

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `number` | Yes | Configuration schema version. Currently `1`. |
| `description` | `string` | No | Human-readable description of the configuration. |
| `updatedAt` | `string` | No | ISO 8601 timestamp of last update (for auditing). |
| `segments` | `Record<string, SegmentDefinition>` | No | Named segment definitions. |
| `flags` | `Record<string, FlagDefinition>` | Yes | Flag definitions, keyed by flag key. |
| `environments` | `Record<string, EnvironmentOverride>` | No | Per-environment flag overrides. |

### Flag Definition Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'prompt' \| 'model' \| 'config' \| 'boolean'` | Yes | The flag type. |
| `description` | `string` | No | Human-readable description. |
| `enabled` | `boolean` | Yes | Whether the flag is active. When `false`, evaluations return `defaultVariant` with reason `"disabled"`. |
| `variants` | `Record<string, { value: T }>` | Yes | Named variants with their values. |
| `defaultVariant` | `string` | Yes | Variant key to return when no rule matches or when disabled. |
| `rules` | `TargetingRule[]` | Yes | Ordered targeting rules (may be empty). |
| `tags` | `string[]` | No | Tags for categorization and filtering (e.g., `["experiment", "prompt"]`). |

### Segment Definition Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | `string` | No | Human-readable description of the segment. |
| `conditions` | `RuleCondition[]` | Yes | Conditions that define membership (AND logic). |

### Environment Overrides

The `environments` section allows per-environment overrides for flag properties. When `createClient({ environment: 'staging' })` is called, the client deep-merges the environment-specific overrides onto the base flag definitions. Only the overridden fields change; all other fields retain their base values.

Overridable fields per flag in an environment: `enabled`, `defaultVariant`, `rules`, and individual variant values. This enables patterns like "all variants resolve to v2 in staging" or "disable this flag in development."

### Configuration Validation

When the configuration is loaded (at `createClient()` time and on hot reload), the client validates:

- `version` is a recognized schema version.
- Every flag has a valid `type`, `enabled` field, `variants` object, and `defaultVariant` that references a defined variant.
- For `boolean` flags, exactly two variants exist with values `true` and `false`.
- For `model` flags, every variant value is an object with a `model` string field.
- For `prompt` flags, every variant value is a string.
- Every rule's `serve.variant` references a defined variant in the flag.
- Every rule's `serve.rollout[].variant` references a defined variant.
- Every rule's `segment` references a defined segment.
- Rollout weights are non-negative numbers.
- Operators in conditions are valid.
- Segment conditions do not reference other segments (no circular references).

Validation errors are collected and reported as a `FlagConfigError` with a `validationErrors` array listing every issue found. This enables all-at-once validation rather than failing on the first error.

---

## 11. Hot Reload

### File Watching

When `hotReload: true` is set in the client configuration, the client watches the configuration file for changes using `node:fs.watch()`. When a file change is detected, the client:

1. Waits for the debounce interval (`hotReloadDebounceMs`, default 500ms) to coalesce rapid successive writes.
2. Reads the configuration file from disk.
3. Parses and validates the new configuration.
4. If validation succeeds, replaces the in-memory configuration atomically.
5. Computes the diff between old and new configurations (added, modified, removed flags).
6. Emits a `ConfigChangeEvent` via the `onConfigChange` callback.
7. Subsequent evaluations use the new configuration immediately.

If validation fails, the new configuration is rejected, the old configuration remains in effect, and an error is emitted via the `onError` callback. The application continues operating with the last known good configuration.

### Atomic Replacement

The in-memory configuration is replaced atomically. There is no partial state where some flags have new values and others have old values. The swap uses a single reference assignment, which is atomic in JavaScript's single-threaded event loop.

### Change Detection

The client detects which flags changed by comparing the old and new configurations:

- **Added**: Flag keys present in the new configuration but not the old.
- **Modified**: Flag keys present in both configurations where the JSON-serialized definitions differ.
- **Removed**: Flag keys present in the old configuration but not the new.

Segment changes are also tracked. When a segment definition changes, all flags referencing that segment are marked as modified.

### External Configuration Sync Pattern

`prompt-flags` does not provide built-in remote configuration sync. For teams that want to update flags from a remote source (API, database, dashboard), the recommended pattern is a sidecar process that fetches the remote configuration and writes it to the local file:

```bash
# Example: sidecar script that polls a remote API every 30 seconds
while true; do
  curl -s https://config.example.com/flags.json > /tmp/flags-new.json
  if diff -q /tmp/flags-new.json ./flags.json > /dev/null 2>&1; then
    : # No change
  else
    cp /tmp/flags-new.json ./flags.json
  fi
  sleep 30
done
```

The application's `prompt-flags` client watches `./flags.json` with hot reload and picks up changes automatically. This keeps the flag evaluation library focused on evaluation and avoids coupling it to network transport concerns.

---

## 12. Evaluation Logging

### Evaluation Events

Every flag evaluation emits an `EvaluationEvent` via the `onEvaluation` callback. Events contain the information needed for analytics, debugging, and experiment analysis without including sensitive user data.

```typescript
interface EvaluationEvent {
  timestamp: string;       // ISO 8601
  flagKey: string;         // "support-prompt"
  variantKey: string;      // "v2"
  flagType: string;        // "prompt"
  reason: string;          // "rule_match"
  contextKey: string;      // "user-123" (just the key, not full context)
  ruleIndex: number;       // 1 (the index of the matching rule, -1 for default)
}
```

The context key is included for bucketing analysis (verifying distribution uniformity), but full context attributes are not included by default to avoid logging sensitive user data (email, organization). If full context is needed for analytics, the application can capture it in the `onEvaluation` callback from the context it passed to the evaluation call.

### Event Export Patterns

The `onEvaluation` callback is a simple function, so events can be routed to any destination:

```typescript
// Log to console
const client = createClient({
  configPath: './flags.json',
  onEvaluation: (event) => console.log(JSON.stringify(event)),
});

// Buffer and batch to analytics service
const buffer: EvaluationEvent[] = [];
const client = createClient({
  configPath: './flags.json',
  onEvaluation: (event) => {
    buffer.push(event);
    if (buffer.length >= 100) {
      analyticsService.trackBatch(buffer.splice(0));
    }
  },
});

// Send to Langfuse for prompt experiment analysis
const client = createClient({
  configPath: './flags.json',
  onEvaluation: (event) => {
    if (event.flagType === 'prompt') {
      langfuse.trace({
        name: 'prompt-flag-evaluation',
        metadata: { flagKey: event.flagKey, variant: event.variantKey },
      });
    }
  },
});
```

### Integration with prompt-drift

Evaluation events can be fed to `prompt-drift` (a sibling package in this monorepo) to monitor for drift in prompt variant distributions. If a configuration change inadvertently shifts traffic away from a variant, `prompt-drift` can detect the distribution change and alert.

---

## 13. Testing Support

### Test Overrides

In test environments, deterministic flag evaluation is essential. The `overrideForTest()` and `overrideValueForTest()` methods allow tests to set specific flag values regardless of targeting rules and percentage rollouts.

```typescript
import { createClient } from 'prompt-flags';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const client = createClient({ configPath: './flags.json' });

describe('chat handler', () => {
  afterEach(() => {
    client.clearAllOverrides();
  });

  it('uses premium model for enterprise prompt', () => {
    client.overrideForTest('model-selection', 'gpt4o');
    client.overrideForTest('support-prompt', 'v2');

    const model = client.getModel('model-selection', { key: 'test-user' });
    expect(model.model).toBe('gpt-4o');

    const prompt = client.getPrompt('support-prompt', { key: 'test-user' });
    expect(prompt).toContain('expert customer support specialist');
  });

  it('handles kill switch disabled', () => {
    client.overrideValueForTest('use-new-summarizer', false);
    const enabled = client.isEnabled('use-new-summarizer', { key: 'test-user' });
    expect(enabled).toBe(false);
  });
});
```

Overrides take precedence over all targeting rules and percentage rollouts. When an override is active, the evaluation reason is `'override'`. Overrides are cleared by `clearOverride(flagKey)` or `clearAllOverrides()`.

### Deterministic Testing Mode

For testing percentage rollout behavior without overrides, tests can use predictable user keys. Because bucketing is deterministic (`murmurhash3(key + flagKey) % 10000`), a test can precompute which variant a specific key receives for a specific flag and assert on it.

```typescript
it('distributes users deterministically', () => {
  // These keys are precomputed to fall in known buckets
  const variant1 = client.evaluate('ab-test', { key: 'user-bucket-control' });
  const variant2 = client.evaluate('ab-test', { key: 'user-bucket-variant' });

  // Same evaluation should always return the same variant
  expect(variant1.variantKey).toBe(client.evaluate('ab-test', { key: 'user-bucket-control' }).variantKey);
});
```

### Snapshot Testing

Flag configurations can be snapshot-tested to detect unintended changes:

```typescript
it('flag configuration matches snapshot', () => {
  const allFlags = client.getFlagKeys();
  const config = allFlags.map((key) => ({
    key,
    flag: client.getFlag(key),
  }));
  expect(config).toMatchSnapshot();
});
```

### Inline Configuration for Tests

Tests can create clients with inline configurations instead of file paths, avoiding test fixture file management:

```typescript
const testClient = createClient({
  config: {
    version: 1,
    flags: {
      'test-flag': {
        type: 'boolean',
        enabled: true,
        variants: {
          on: { value: true },
          off: { value: false },
        },
        defaultVariant: 'on',
        rules: [],
      },
    },
  },
});
```

---

## 14. CLI

### Installation and Invocation

```bash
# Global install
npm install -g prompt-flags
prompt-flags list

# npx (no install)
npx prompt-flags list

# Package script
# package.json: { "scripts": { "flags:list": "prompt-flags list" } }
npm run flags:list
```

### CLI Binary Name

`prompt-flags`

### Commands

```
prompt-flags <command> [options]

Commands:
  list                          List all flags in the configuration.
  evaluate <key>                Evaluate a flag with a test context.
  validate                      Validate the configuration file.
  inspect <key>                 Show detailed flag definition and rules.
  distribution <key>            Simulate rollout distribution for a flag.

List options:
  --config <path>               Configuration file path. Default: ./flags.json
  --type <type>                 Filter by flag type (prompt, model, config, boolean).
  --tag <tag>                   Filter by tag.
  --json                        Output as JSON.
  --enabled-only                Only show enabled flags.

Evaluate options:
  --config <path>               Configuration file path.
  --context <json>              Evaluation context as JSON string.
  --key <key>                   Context key (shorthand for simple contexts).
  --plan <plan>                 Context plan attribute.
  --region <region>             Context region attribute.
  --environment <env>           Environment for overrides.
  --json                        Output as JSON.

Validate options:
  --config <path>               Configuration file path.
  --strict                      Treat warnings as errors.

Inspect options:
  --config <path>               Configuration file path.

Distribution options:
  --config <path>               Configuration file path.
  --samples <n>                 Number of simulated users. Default: 10000.
  --json                        Output as JSON.

General:
  --version                     Print version and exit.
  --help                        Print help and exit.
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success. |
| `1` | Error. Flag not found, evaluation error, or validation failure. |
| `2` | Configuration error. Invalid flags, missing file, or parse failure. |

### Command Examples

**List all flags:**

```
$ prompt-flags list --config ./flags.json

  prompt-flags configuration (./flags.json)

  KEY                  TYPE      ENABLED   VARIANTS   RULES   DESCRIPTION
  support-prompt       prompt    yes       2          2       Customer support system prompt
  model-selection      model     yes       2          1       Model and parameter configuration
  use-new-summarizer   boolean   yes       2          0       Kill switch for the new summarizer
  rag-config           config    yes       2          1       RAG retrieval and generation settings

  4 flags (4 enabled, 0 disabled)
```

**Evaluate a flag:**

```
$ prompt-flags evaluate support-prompt \
    --key user-123 --plan enterprise --config ./flags.json

  Flag:      support-prompt
  Type:      prompt
  Enabled:   yes
  Variant:   v2
  Reason:    rule_match (rule 0: "Internal team always gets v2")

  Value:
  You are an expert customer support specialist for ACME Corp. Resolve the
  customer's issue in a single interaction.
```

**Validate configuration:**

```
$ prompt-flags validate --config ./flags.json

  Validating ./flags.json...

  ✓ Configuration schema is valid.
  ✓ 4 flags defined, all valid.
  ✓ 3 segments defined, all valid.
  ✓ All variant references resolve.
  ✓ All segment references resolve.
  ✓ All rollout weights are non-negative.
  ✓ Boolean flags have exactly 2 variants.

  Configuration is valid.
```

**Simulate rollout distribution:**

```
$ prompt-flags distribution support-prompt --samples 10000

  Flag: support-prompt
  Evaluating rule 1 (catch-all rollout) with 10000 random users...

  VARIANT       TARGET    ACTUAL    DEVIATION
  v1            80.00%    80.12%    +0.12%
  v2            20.00%    19.88%    -0.12%

  Distribution is within expected variance for 10000 samples.
```

### Environment Variables

| Environment Variable | Equivalent Flag |
|---------------------|-----------------|
| `PROMPT_FLAGS_CONFIG` | `--config` |
| `PROMPT_FLAGS_ENVIRONMENT` | `--environment` |
| `NO_COLOR` | `--no-color` |

---

## 15. Integration

### Integration with LLM SDKs

`prompt-flags` resolves configuration values. The application uses those values with its preferred LLM client. The integration pattern is the same regardless of SDK:

**OpenAI SDK:**

```typescript
import { createClient } from 'prompt-flags';
import OpenAI from 'openai';

const flags = createClient({ configPath: './flags.json' });
const openai = new OpenAI();

const ctx = { key: userId, plan: userPlan };
const prompt = flags.getPrompt('system-prompt', ctx);
const { model, temperature, maxTokens } = flags.getModel('model-config', ctx);

const response = await openai.chat.completions.create({
  model,
  temperature,
  max_tokens: maxTokens,
  messages: [{ role: 'system', content: prompt }, { role: 'user', content: userMessage }],
});
```

**Anthropic SDK:**

```typescript
import { createClient } from 'prompt-flags';
import Anthropic from '@anthropic-ai/sdk';

const flags = createClient({ configPath: './flags.json' });
const anthropic = new Anthropic();

const ctx = { key: userId, plan: userPlan };
const prompt = flags.getPrompt('system-prompt', ctx);
const { model, maxTokens, temperature } = flags.getModel('model-config', ctx);

const response = await anthropic.messages.create({
  model,
  max_tokens: maxTokens,
  temperature,
  system: prompt,
  messages: [{ role: 'user', content: userMessage }],
});
```

**Vercel AI SDK:**

```typescript
import { createClient } from 'prompt-flags';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const flags = createClient({ configPath: './flags.json' });
const ctx = { key: userId, plan: userPlan };

const prompt = flags.getPrompt('system-prompt', ctx);
const modelConfig = flags.getModel('model-config', ctx);

const { text } = await generateText({
  model: openai(modelConfig.model),
  system: prompt,
  prompt: userMessage,
  temperature: modelConfig.temperature,
  maxTokens: modelConfig.maxTokens,
});
```

### Integration with prompt-version

`prompt-flags` and `prompt-version` are complementary. `prompt-version` manages the versioned content of prompts. `prompt-flags` routes users to specific prompt variants at runtime. The integration pattern is: flag variant values reference prompt version identifiers, and the application resolves them via `prompt-version`.

```typescript
import { createClient } from 'prompt-flags';
import { createRegistry } from 'prompt-version';

const flags = createClient({ configPath: './flags.json' });
const registry = createRegistry({ registryDir: './prompts' });

const ctx = { key: userId, plan: userPlan };

// Flag variants store prompt version ranges
// e.g., variant "v1" value: "support-prompt@^1.0.0"
//        variant "v2" value: "support-prompt@^2.0.0"
const promptRef = flags.getPrompt('support-prompt-version', ctx);
const [promptName, versionRange] = promptRef.split('@');
const resolved = registry.getPrompt(promptName, versionRange);
const systemPrompt = resolved.content;
```

### Integration with prompt-inherit

Prompt flags can reference prompts built with `prompt-inherit`. Flag variant values can be prompt keys that the application resolves using the prompt inheritance chain:

```typescript
import { createClient } from 'prompt-flags';
import { definePrompt } from 'prompt-inherit';

const flags = createClient({ configPath: './flags.json' });

const basePrompt = definePrompt({
  sections: { persona: 'You are a helpful assistant.', safety: 'Never share internal data.' },
});

const variants = {
  formal: basePrompt.extend({ sections: { persona: { content: 'You are a professional advisor.', strategy: 'replace' } } }),
  casual: basePrompt.extend({ sections: { persona: { content: 'You are a friendly helper.', strategy: 'replace' } } }),
};

const ctx = { key: userId, plan: userPlan };
const variantKey = flags.evaluate('tone-variant', ctx).variantKey;
const prompt = variants[variantKey].render();
```

### Integration with Observability

Evaluation events integrate with any observability pipeline via the `onEvaluation` callback. Common patterns:

- **Langfuse**: Attach flag variant as trace metadata for prompt experiment analysis.
- **PostHog**: Send evaluation events as feature flag events for experiment dashboards.
- **Custom metrics**: Count evaluations per flag and variant for real-time monitoring.
- **Audit logging**: Record all evaluations for compliance and debugging.

---

## 16. Testing Strategy

### Unit Tests

Unit tests verify each component in isolation.

- **Rule condition evaluation tests**: For each comparison operator (`equals`, `notEquals`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`, `matches`, `exists`, `notExists`, `semverEquals`, `semverGreaterThan`, `semverLessThan`), test with matching and non-matching context values. Test with missing attributes (expect `false`). Test with type mismatches (string attribute compared with `greaterThan` -- expect `false`). Test `negate` option.

- **Rule evaluation tests**: Test single-condition rules, multi-condition rules (AND logic), rules with segment references, rules with inline conditions plus segment references. Test first-match-wins ordering: create three rules where the first matches and verify the second and third are not evaluated. Test empty conditions (match-all rule). Test empty rules array (default variant served).

- **Segment evaluation tests**: Test segment condition matching. Test segment referenced by multiple flags. Test invalid segment reference (expect `SegmentNotFoundError`). Test segment with multiple conditions (AND logic).

- **Percentage rollout tests**: Test deterministic bucketing: the same `key + flagKey` always produces the same variant. Test bucketing independence: different flag keys produce different variants for the same user. Test weight distribution: simulate 100,000 random keys and verify variant distribution matches weights within 1% tolerance. Test edge cases: single-variant rollout (100%), zero-weight variant, two variants with equal weights (50/50).

- **Hash function tests**: Verify `murmurhash3(input) % 10000` produces stable, well-distributed values. Test with known input/output pairs for regression. Test empty string input. Test very long string input.

- **Flag type validation tests**: For each flag type, test that variants with wrong value types are rejected at validation time. Test boolean flags with more or fewer than two variants. Test model flags with variant values missing the `model` field.

- **Configuration validation tests**: Test valid configurations. Test each validation rule individually: missing `version`, missing `flags`, invalid flag type, missing `defaultVariant`, `defaultVariant` referencing undefined variant, rule referencing undefined variant, rule referencing undefined segment, negative rollout weights, invalid operator in condition.

- **Configuration loading tests**: Test loading from JSON file. Test loading from inline config. Test loading from YAML file. Test file-not-found error. Test JSON parse error. Test YAML parse error.

- **Hot reload tests**: Test that file changes trigger configuration reload. Test debounce behavior: rapid successive writes result in a single reload. Test that invalid file changes are rejected and old config is retained. Test `ConfigChangeEvent` emission with correct added/modified/removed flag keys.

- **Evaluation event tests**: Test that `EvaluationEvent` is emitted with correct fields for each evaluation reason (`rule_match`, `default`, `disabled`, `error`, `override`). Test that `contextKey` is included but full context attributes are not.

- **Test override tests**: Test `overrideForTest()` with valid variant key. Test `overrideValueForTest()` with arbitrary value. Test that overrides take precedence over rules. Test `clearOverride()` and `clearAllOverrides()`. Test that evaluation reason is `'override'` when an override is active.

- **Error handling tests**: For each error class (`FlagNotFoundError`, `FlagTypeMismatchError`, `FlagConfigError`, `VariantNotFoundError`, `SegmentNotFoundError`, `ClientDisposedError`), verify the error is thrown in the correct circumstance with the correct properties.

- **Client lifecycle tests**: Test `dispose()` stops file watching. Test that evaluation methods throw `ClientDisposedError` after `dispose()`. Test `reload()` refreshes configuration from disk.

### Integration Tests

Integration tests exercise the full evaluation pipeline from configuration loading through variant resolution.

- **Full evaluation pipeline test**: Load a configuration file with multiple flags of different types, segments, and targeting rules. Evaluate each flag with contexts that match different rules. Verify that the correct variant is returned for each case.

- **Prompt A/B test simulation**: Configure a prompt flag with 50/50 rollout. Generate 10,000 random user keys. Evaluate the flag for each key. Verify the distribution is approximately 50/50 (within 2% tolerance). Verify that evaluating the same key twice returns the same variant.

- **Model migration simulation**: Configure a model flag with a ramp-up sequence. Verify that increasing the rollout percentage from 10% to 50% keeps the original 10% users on the same variant.

- **Segment targeting test**: Define three segments with different conditions. Configure flags that target each segment. Evaluate with contexts matching each segment. Verify correct variant selection.

- **Environment override test**: Configure base flags and environment-specific overrides. Create a client with an environment. Verify that overridden properties use the environment values while non-overridden properties use the base values.

- **Hot reload end-to-end test**: Create a client with hot reload enabled pointing at a temporary configuration file. Evaluate a flag. Modify the file (change a variant value). Wait for the debounce interval. Evaluate the flag again. Verify the new value is returned. Verify the `onConfigChange` callback was called.

- **CLI end-to-end tests**: Run CLI commands (`list`, `evaluate`, `validate`, `inspect`, `distribution`) against test configuration files and verify stdout output, exit codes, and JSON output format.

### Edge Cases to Test

- Empty configuration (no flags defined).
- Flag with no rules (only default variant).
- Flag with a single variant (no targeting, no rollout).
- Rule with no conditions (matches all contexts -- catch-all rule).
- Context with only a `key` and no other attributes.
- Context with an empty string `key` (expect warning, random bucketing).
- Context with `null` or `undefined` (expect default variant with reason `"error"`).
- Configuration file with trailing comma (JSON parse error).
- Configuration file that is valid JSON but fails schema validation.
- Flag key with special characters (dots, slashes, spaces).
- Variant value that is an extremely large string (1 MB prompt).
- 100+ flags in a single configuration (performance test).
- Rollout weights that sum to 0 (degenerate case).
- Rollout with a single variant at weight 100.
- Circular segment reference (segment A references segment B which references A -- not possible in the current design since segments cannot reference other segments).
- Concurrent evaluations (JavaScript is single-threaded, but test from multiple async contexts to verify no shared state corruption).

### Test Framework

Tests use Vitest, matching the project's existing `package.json` configuration. Test fixtures use temporary files created via `node:fs/promises.mkdtemp` for hot reload tests. Inline configurations are used for unit tests to avoid fixture file dependencies. All test state is generated dynamically; no fixture files are committed.

---

## 17. Performance

### Evaluation Speed

Flag evaluation is a pure in-memory operation with no I/O. The evaluation pipeline consists of:

1. **Lookup flag definition**: O(1) hash map lookup by flag key.
2. **Iterate rules**: O(R) where R is the number of rules. For each rule, evaluate O(C) conditions where C is the number of conditions per rule. Condition evaluation is O(1) per condition (string comparison, numeric comparison, regex match, set membership via `Set.has()`).
3. **Compute bucket** (for rollout): One `murmurhash3()` call and one modulo operation. MurmurHash3 x86 32-bit completes in under 100 nanoseconds for typical input lengths.
4. **Return variant value**: O(1) hash map lookup by variant key.

For a flag with 5 rules, each with 2 conditions, and a percentage rollout, a single evaluation completes in under 10 microseconds. For 100 flags evaluated with `allFlags()`, the total time is under 1 millisecond.

### Configuration Loading

Configuration loading reads and parses the JSON file, validates the schema, and builds the in-memory representation. For a configuration with 50 flags, 10 segments, and 200 total rules, loading completes in under 10ms. The configuration is parsed once at startup and cached in memory.

### Hot Reload

Hot reload adds overhead only when the configuration file changes. The file watcher uses `node:fs.watch()`, which is an OS-level notification mechanism with no polling overhead. When a change is detected, the reload path (read file, parse, validate, swap) completes in under 20ms for typical configurations. The debounce interval (default 500ms) prevents reload storms from rapid file writes (common with text editors that write temporary files).

### Memory

The in-memory configuration stores flag definitions, variants, rules, and segments as plain JavaScript objects. For a configuration with 50 flags, each with 3 variants (average 500 bytes per variant value), the memory footprint is approximately 200 KB. Prompt variant values can be larger (multi-kilobyte system prompts), but even with 50 flags containing 2 KB prompts, the total is under 1 MB.

### Hashing

MurmurHash3 x86 32-bit is used for deterministic bucketing. The `murmurhash3js` npm package provides a pure JavaScript implementation that completes in under 100 nanoseconds for input strings under 200 characters (typical for `userId + "/" + flagKey`). The hash is computed once per evaluation, not once per rule.

### Startup

`createClient()` reads the configuration file, parses JSON, validates, and returns. For typical configurations, cold startup completes in under 15ms. There is no background initialization, no network I/O, and no deferred loading. The client is ready for evaluation as soon as `createClient()` returns.

---

## 18. Dependencies

### Runtime Dependencies

| Dependency | Purpose | Why Not Built-In |
|---|---|---|
| `murmurhash3js` | Deterministic 32-bit hashing for percentage rollout bucketing. | MurmurHash3 is the industry-standard hash function for feature flag bucketing, used by LaunchDarkly, Amplitude Experiment, and Unleash. It provides uniform distribution, avalanche properties, and consistency across platforms. Implementing it correctly is error-prone and would provide no benefit over the well-tested npm package (3 KB, zero dependencies). |

### Why Minimal Dependencies

- **No CLI framework**: `node:util.parseArgs` (available since Node.js 18) handles all flag parsing. No dependency on `commander`, `yargs`, or `meow`.
- **No YAML parser**: The built-in YAML support handles the simple subset used for flag configuration (flat objects, arrays, strings, numbers, booleans). Complex YAML features are not needed. Users with complex needs can use JSON.
- **No JSON Schema validator**: Configuration validation is implemented with hand-written TypeScript checks that produce descriptive error messages specific to flag configuration. Generic JSON Schema validators produce cryptic error paths that are unhelpful for flag configuration debugging.
- **No chalk/colors**: Terminal coloring uses ANSI escape codes directly. Color detection uses `process.stdout.isTTY` and the `NO_COLOR` environment variable.
- **No file-watching library**: `node:fs.watch()` provides OS-native file change notifications. Higher-level watchers like `chokidar` are unnecessary for watching a single file.
- **No semver library**: Semver comparison operators (`semverEquals`, `semverGreaterThan`, `semverLessThan`) are implemented with a minimal inline parser that handles the `MAJOR.MINOR.PATCH` format. Full semver range resolution is not needed (that is `prompt-version`'s domain).

### Node.js Built-ins Used

| Node.js Built-in | Purpose |
|---|---|
| `node:fs` and `node:fs/promises` | Reading configuration files, file watching for hot reload. |
| `node:path` | Path resolution, file extension detection (JSON vs YAML). |
| `node:util` | `parseArgs` for CLI argument parsing (Node.js 18+). |
| `node:process` | Exit codes, environment variables, `cwd()`. |
| `node:crypto` | `randomUUID()` for generating random keys when context key is missing. |

### Dev Dependencies

| Dependency | Purpose |
|---|---|
| `typescript` | TypeScript compiler. |
| `vitest` | Test runner. |
| `eslint` | Linter for source code. |

---

## 19. File Structure

```
prompt-flags/
  package.json
  tsconfig.json
  SPEC.md
  README.md
  src/
    index.ts                        Public API exports: createClient, types, errors.
    types.ts                        All TypeScript type definitions (FlagClientConfig,
                                    EvaluationContext, FlagDefinition, TargetingRule,
                                    RuleCondition, ModelConfig, EvaluationResult,
                                    EvaluationEvent, ConfigChangeEvent, etc.).
    client.ts                       FlagClient class implementation: evaluate,
                                    getPrompt, getModel, getConfig, isEnabled,
                                    allFlags, overrideForTest, reload, dispose.
    evaluator/
      index.ts                      Evaluation entry point: evaluate(flag, context).
      rule-matcher.ts               Rule evaluation: iterates rules, evaluates
                                    conditions, returns matching rule or null.
      condition-evaluator.ts        Condition evaluation: operator dispatch,
                                    attribute access, type coercion.
      rollout.ts                    Percentage rollout: deterministic bucketing
                                    via murmurhash3, variant selection from weights.
      segment-resolver.ts           Segment resolution: resolves segment references
                                    to condition arrays.
    config/
      index.ts                      Configuration entry point: load, parse, validate.
      loader.ts                     File loading: JSON and YAML parsing, file
                                    existence checks, error wrapping.
      validator.ts                  Schema validation: flag structure, variant
                                    references, segment references, type-specific
                                    validation (boolean, model, prompt, config).
      merger.ts                     Environment override merging: deep-merge
                                    environment-specific overrides onto base config.
      watcher.ts                    Hot reload: file watcher, debounce, atomic
                                    configuration swap, change diff computation.
      yaml-parser.ts                Minimal YAML parser for the configuration
                                    subset (objects, arrays, scalars).
    hash.ts                         MurmurHash3 wrapper: deterministic bucket
                                    computation from key + flagKey.
    errors.ts                       Error classes: FlagError, FlagNotFoundError,
                                    FlagTypeMismatchError, FlagConfigError,
                                    VariantNotFoundError, SegmentNotFoundError,
                                    ClientDisposedError.
    cli.ts                          CLI entry point: argument parsing, command
                                    dispatch, output formatting, exit codes.
    cli/
      list.ts                       List command: flag enumeration, filtering,
                                    table formatting.
      evaluate.ts                   Evaluate command: context parsing, flag
                                    evaluation, result formatting.
      validate.ts                   Validate command: configuration validation,
                                    result reporting.
      inspect.ts                    Inspect command: flag definition display,
                                    rule enumeration.
      distribution.ts               Distribution command: rollout simulation,
                                    variance reporting.
    utils/
      format.ts                     Output formatting: tables, colored text,
                                    JSON serialization.
      context.ts                    Context utilities: default merging, attribute
                                    path resolution (dot notation), validation.
  src/__tests__/
    evaluator/
      rule-matcher.test.ts          Rule evaluation unit tests.
      condition-evaluator.test.ts   Condition evaluation unit tests (all operators).
      rollout.test.ts               Percentage rollout unit tests.
      segment-resolver.test.ts      Segment resolution unit tests.
    config/
      loader.test.ts                Configuration loading unit tests.
      validator.test.ts             Configuration validation unit tests.
      merger.test.ts                Environment merge unit tests.
      watcher.test.ts               Hot reload unit tests.
    hash.test.ts                    Hash function unit tests.
    client.test.ts                  FlagClient unit tests (full API).
    errors.test.ts                  Error class tests.
    integration.test.ts             Full pipeline integration tests.
    cli.test.ts                     CLI end-to-end tests.
    fixtures/
      valid-config.json             Valid configuration with all flag types.
      invalid-configs/
        missing-version.json
        invalid-flag-type.json
        bad-variant-ref.json
        bad-segment-ref.json
  bin/
    prompt-flags.js                 CLI binary entry point (#!/usr/bin/env node).
  dist/                             Compiled output (gitignored).
```

---

## 20. Implementation Roadmap

### Phase 1: Core Evaluation Engine (v0.1.0)

Implement the in-memory flag evaluation engine with rule matching, condition evaluation, and deterministic percentage rollout.

**Deliverables:**
- Type definitions for all core types: `FlagClientConfig`, `EvaluationContext`, `FlagDefinition`, `TargetingRule`, `RuleCondition`, `ModelConfig`, `EvaluationResult`.
- Configuration loader: JSON file parsing, schema validation, error reporting.
- Condition evaluator: all comparison operators (`equals`, `notEquals`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`, `matches`, `exists`, `notExists`).
- Rule matcher: first-match-wins evaluation, AND logic for conditions within a rule.
- Segment resolver: segment reference resolution, segment condition evaluation.
- Percentage rollout: deterministic bucketing via `murmurhash3(key + flagKey) % 10000`, variant selection from cumulative weights.
- `createClient()` with `configPath` and inline `config` support.
- `FlagClient` methods: `evaluate()`, `getPrompt()`, `getModel()`, `getConfig()`, `isEnabled()`, `allFlags()`.
- Flag type validation: boolean (2 variants), model (model field required), prompt (string values), config (object values).
- Error classes for all error conditions.
- Default variant fallback for disabled flags, missing context, and evaluation errors.
- Unit tests for condition evaluation, rule matching, rollout bucketing, and configuration validation.
- Integration tests for the full evaluation pipeline.

### Phase 2: Segments, Overrides, and CLI (v0.2.0)

Add reusable segments, test overrides, evaluation events, and the CLI.

**Deliverables:**
- Segment definitions in configuration with multi-flag reuse.
- `overrideForTest()`, `overrideValueForTest()`, `clearOverride()`, `clearAllOverrides()`.
- `EvaluationEvent` emission via `onEvaluation` callback.
- Semver comparison operators (`semverEquals`, `semverGreaterThan`, `semverLessThan`).
- Context utilities: default context merging, dot-notation attribute access, context validation.
- CLI: `list`, `evaluate`, `validate`, `inspect` commands.
- CLI argument parsing with `node:util.parseArgs`.
- Human-readable and JSON output formatting.
- Exit codes (0, 1, 2).
- Unit tests for segments, overrides, events, and CLI commands.

### Phase 3: Hot Reload, Environments, and Distribution (v0.3.0)

Add hot reload, environment overrides, and the distribution simulation command.

**Deliverables:**
- File watcher for hot reload using `node:fs.watch()`.
- Debounced reload with configurable interval.
- Atomic configuration swap with change diff computation.
- `ConfigChangeEvent` emission via `onConfigChange` callback.
- Graceful handling of invalid file changes (reject, keep old config, emit error).
- Environment override merging (deep merge of environment-specific flag properties).
- `distribution` CLI command: simulate N random users and report variant distribution.
- YAML configuration file support with minimal built-in parser.
- `dispose()` method for clean shutdown.
- Unit tests for hot reload, environment merging, and distribution simulation.
- Integration tests for hot reload end-to-end.

### Phase 4: Polish and 1.0 (v1.0.0)

Stabilize the API, complete documentation, and prepare for production use.

**Deliverables:**
- API stability guarantee (semver major version).
- Complete README with usage examples, configuration reference, and integration guide.
- Environment variable support for all CLI options.
- Performance benchmarks: evaluation speed, configuration loading time, memory usage.
- Comprehensive edge case testing.
- TypeScript type refinements for improved IntelliSense.
- Published npm package with TypeScript declarations.
- Integration examples for OpenAI SDK, Anthropic SDK, Vercel AI SDK, `prompt-version`, `prompt-inherit`.

---

## 21. Example Use Cases

### 21.1 Prompt A/B Test

A team wants to test two prompt variants for their customer support system to determine which produces higher user satisfaction scores.

**Configuration:**

```json
{
  "version": 1,
  "flags": {
    "support-prompt": {
      "type": "prompt",
      "description": "A/B test: concise vs detailed support prompt",
      "enabled": true,
      "variants": {
        "concise": {
          "value": "You are a customer support agent. Answer questions about our products briefly and clearly. Keep responses under 3 sentences."
        },
        "detailed": {
          "value": "You are a customer support specialist. Provide thorough answers about our products. Include relevant product details, link to documentation when helpful, and proactively address related questions the customer might have."
        }
      },
      "defaultVariant": "concise",
      "rules": [
        {
          "description": "50/50 split for all users",
          "conditions": [],
          "serve": {
            "rollout": [
              { "variant": "concise", "weight": 50 },
              { "variant": "detailed", "weight": 50 }
            ]
          }
        }
      ]
    }
  }
}
```

**Application code:**

```typescript
import { createClient } from 'prompt-flags';

const flags = createClient({
  configPath: './flags.json',
  onEvaluation: (event) => {
    // Log to analytics for experiment analysis
    analytics.track('prompt_variant_served', {
      flagKey: event.flagKey,
      variant: event.variantKey,
      userId: event.contextKey,
    });
  },
});

async function handleSupportChat(userId: string, message: string) {
  const systemPrompt = flags.getPrompt('support-prompt', { key: userId });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ],
  });

  return response.choices[0].message.content;
}
```

After collecting satisfaction scores for both variants over a week, the team analyzes the results. The "detailed" variant scores 15% higher. They ramp up to 100%:

```json
{ "rollout": [{ "variant": "detailed", "weight": 100 }] }
```

### 21.2 Gradual Model Migration

A team is migrating from GPT-4o to Claude Sonnet. They want to roll out gradually, starting with internal users, then beta testers, then a small percentage of production traffic.

**Configuration:**

```json
{
  "version": 1,
  "segments": {
    "internal-team": {
      "description": "Internal employees",
      "conditions": [
        { "attribute": "email", "operator": "endsWith", "value": "@ourcompany.com" }
      ]
    },
    "beta-testers": {
      "description": "Users who opted into beta",
      "conditions": [
        { "attribute": "custom.betaTester", "operator": "equals", "value": true }
      ]
    }
  },
  "flags": {
    "chat-model": {
      "type": "model",
      "description": "Gradual migration from GPT-4o to Claude Sonnet",
      "enabled": true,
      "variants": {
        "gpt4o": {
          "value": { "model": "gpt-4o", "temperature": 0.3, "maxTokens": 2048 }
        },
        "claude-sonnet": {
          "value": { "model": "claude-sonnet-4-20250514", "temperature": 0.3, "maxTokens": 2048 }
        }
      },
      "defaultVariant": "gpt4o",
      "rules": [
        {
          "description": "Internal team always gets Claude Sonnet",
          "segment": "internal-team",
          "serve": { "variant": "claude-sonnet" }
        },
        {
          "description": "Beta testers get Claude Sonnet",
          "segment": "beta-testers",
          "serve": { "variant": "claude-sonnet" }
        },
        {
          "description": "5% of production traffic on Claude Sonnet",
          "conditions": [],
          "serve": {
            "rollout": [
              { "variant": "gpt4o", "weight": 95 },
              { "variant": "claude-sonnet", "weight": 5 }
            ]
          }
        }
      ]
    }
  }
}
```

**Ramp-up schedule** (each step is a configuration file edit, reviewed in a PR):

- Week 1: Internal team + beta testers + 5% production
- Week 2: Internal team + beta testers + 25% production (change weight to 75/25)
- Week 3: Internal team + beta testers + 50% production (change weight to 50/50)
- Week 4: 100% production (change default to "claude-sonnet", remove rules)

### 21.3 Per-Segment Model and Parameter Configuration

A team configures different models and parameters for different user tiers.

**Configuration:**

```json
{
  "version": 1,
  "segments": {
    "enterprise-users": {
      "conditions": [
        { "attribute": "plan", "operator": "in", "values": ["enterprise", "business"] }
      ]
    },
    "pro-users": {
      "conditions": [
        { "attribute": "plan", "operator": "equals", "value": "pro" }
      ]
    }
  },
  "flags": {
    "chat-model": {
      "type": "model",
      "description": "Tier-based model selection",
      "enabled": true,
      "variants": {
        "premium": {
          "value": { "model": "gpt-4o", "temperature": 0.2, "maxTokens": 4096, "topP": 0.95 }
        },
        "standard": {
          "value": { "model": "gpt-4o", "temperature": 0.4, "maxTokens": 2048 }
        },
        "budget": {
          "value": { "model": "gpt-4o-mini", "temperature": 0.5, "maxTokens": 1024 }
        }
      },
      "defaultVariant": "budget",
      "rules": [
        {
          "segment": "enterprise-users",
          "serve": { "variant": "premium" }
        },
        {
          "segment": "pro-users",
          "serve": { "variant": "standard" }
        }
      ]
    }
  }
}
```

Enterprise and business users receive GPT-4o with conservative parameters. Pro users receive GPT-4o with moderate parameters. Free-tier users (matching no rule) receive GPT-4o-mini as the default. The team can adjust any tier's configuration independently by editing the variant value, with no code changes.

### 21.4 Kill Switch for Emergency Rollback

A team deploys a new summarizer pipeline behind a kill switch. When monitoring detects a quality regression, they disable the flag instantly.

**Configuration (normal operation):**

```json
{
  "version": 1,
  "flags": {
    "use-new-summarizer": {
      "type": "boolean",
      "description": "Kill switch for the new summarizer pipeline",
      "enabled": true,
      "variants": {
        "on": { "value": true },
        "off": { "value": false }
      },
      "defaultVariant": "on",
      "rules": []
    }
  }
}
```

**Application code:**

```typescript
const flags = createClient({ configPath: './flags.json', hotReload: true });

async function summarize(userId: string, document: string) {
  const useNew = flags.isEnabled('use-new-summarizer', { key: userId });

  if (useNew) {
    return newSummarizer.summarize(document);
  } else {
    return legacySummarizer.summarize(document);
  }
}
```

**Emergency rollback** -- change `"enabled": true` to `"enabled": false`:

```json
{
  "use-new-summarizer": {
    "enabled": false,
    ...
  }
}
```

With hot reload enabled, all evaluations start returning `false` (the default variant) within 500ms of the file change. No deployment required. The team investigates the quality issue, fixes the new summarizer, and re-enables the flag.

### 21.5 Multi-Flag AI Pipeline Configuration

A team configures an entire AI pipeline -- prompt, model, retrieval settings, and output format -- through multiple coordinated flags.

```typescript
import { createClient } from 'prompt-flags';

const flags = createClient({ configPath: './flags.json' });

async function handleQuery(userId: string, plan: string, query: string) {
  const ctx = { key: userId, plan };

  // Resolve all pipeline configuration from flags
  const systemPrompt = flags.getPrompt('query-system-prompt', ctx);
  const { model, temperature, maxTokens } = flags.getModel('query-model', ctx);
  const ragConfig = flags.getConfig<RAGConfig>('rag-config', ctx);
  const useReranking = flags.isEnabled('use-reranking', ctx);

  // Retrieval
  const docs = await retriever.search(query, {
    topK: ragConfig.retrievalTopK,
    minScore: ragConfig.retrievalMinScore,
  });

  // Optional reranking
  const rankedDocs = useReranking ? await reranker.rerank(docs, query) : docs;

  // Generation
  const context = rankedDocs.map(d => d.content).join('\n\n');
  const response = await llm.generate({
    model,
    temperature,
    maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` },
    ],
  });

  return response;
}
```

Each flag in the pipeline can be independently A/B tested, gradually rolled out, and configured per segment. The prompt team experiments with prompt variants while the ML team migrates models and tunes parameters -- independently, without coordination, because each concern is a separate flag.
