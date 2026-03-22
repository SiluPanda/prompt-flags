# prompt-flags — Implementation Tasks

This file tracks all implementation tasks derived from [SPEC.md](./SPEC.md). Tasks are grouped into phases matching the implementation roadmap, with additional phases for testing, documentation, and publishing.

---

## Phase 0: Project Scaffolding & Setup

- [x] **Install runtime dependency `murmurhash3js`** — Add `murmurhash3js` as a runtime dependency in `package.json`. This is the only runtime dependency; it provides deterministic 32-bit hashing for percentage rollout bucketing. | Status: done
- [x] **Install dev dependencies** — Add `typescript`, `vitest`, and `eslint` as dev dependencies in `package.json`. Verify existing `scripts` entries (`build`, `test`, `lint`) work. | Status: done
- [ ] **Add `bin` entry to `package.json`** — Add `"bin": { "prompt-flags": "./bin/prompt-flags.js" }` to `package.json` so the CLI binary is registered when the package is installed globally or via npx. | Status: not_done
- [ ] **Create `bin/prompt-flags.js` CLI entry point** — Create the `bin/` directory and `bin/prompt-flags.js` file with a `#!/usr/bin/env node` shebang that requires the compiled CLI module from `dist/cli.js`. | Status: not_done
- [ ] **Create directory structure** — Create all directories specified in the file structure: `src/evaluator/`, `src/config/`, `src/cli/`, `src/utils/`, `src/__tests__/evaluator/`, `src/__tests__/config/`, `src/__tests__/fixtures/`, `src/__tests__/fixtures/invalid-configs/`. | Status: not_done
- [x] **Configure Vitest** — Add a `vitest.config.ts` (or configure in `package.json`) so that `npm run test` runs Vitest against `src/__tests__/**/*.test.ts`. | Status: done
- [x] **Configure ESLint** — Set up ESLint configuration (e.g., `.eslintrc` or `eslint.config.js`) for TypeScript linting of the `src/` directory. | Status: done
- [ ] **Add `.gitignore` entries** — Ensure `dist/`, `node_modules/`, and any temporary test output directories are gitignored. | Status: not_done

---

## Phase 1: Core Type Definitions (`src/types.ts`)

- [ ] **Define `FlagClientConfig` interface** — Include all fields: `configPath`, `config` (inline), `hotReload`, `hotReloadDebounceMs`, `onEvaluation`, `onConfigChange`, `onError`, `defaultContext`, `environment`. Ensure `configPath` and `config` are documented as mutually exclusive. | Status: not_done
- [ ] **Define `EvaluationContext` interface** — Include required `key: string` and optional fields: `plan`, `region`, `language`, `email`, `organization`, `role`, `custom: Record<string, string | number | boolean | string[]>`. | Status: not_done
- [ ] **Define `FlagDefinition` interface** — Include fields: `type` (union of flag types), `description`, `enabled`, `variants` (Record of name to `{ value: T }`), `defaultVariant`, `rules` (array of `TargetingRule`), `tags`. | Status: not_done
- [ ] **Define `TargetingRule` interface** — Include `description?`, `conditions?` (array of `RuleCondition`), `segment?` (string reference), `serve` (`ServeDirective`). | Status: not_done
- [x] **Define `RuleCondition` interface** — Include `attribute`, `operator` (`ComparisonOperator`), `value?`, `values?`, `negate?`. | Status: done
- [ ] **Define `ComparisonOperator` type** — Union of all 16 operators: `equals`, `notEquals`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`, `greaterThanOrEqual`, `lessThanOrEqual`, `matches`, `exists`, `notExists`, `semverEquals`, `semverGreaterThan`, `semverLessThan`. | Status: not_done
- [x] **Define `ServeDirective` type** — Union of `{ variant: string }` (fixed) and `{ rollout: Array<{ variant: string; weight: number }> }` (percentage). | Status: done
- [x] **Define `ModelConfig` interface** — Include `model: string` (required) and optional fields: `temperature`, `maxTokens`, `topP`, `frequencyPenalty`, `presencePenalty`, `stop`, plus index signature `[key: string]: unknown` for provider-specific parameters. | Status: done
- [x] **Define `EvaluationResult<T>` interface** — Include `flagKey`, `variantKey`, `value: T`, `reason` (`EvaluationReason`), `flagEnabled`. | Status: done
- [x] **Define `EvaluationReason` type** — Union of `'rule_match'`, `'default'`, `'disabled'`, `'error'`, `'override'`. | Status: done
- [ ] **Define `EvaluationEvent` interface** — Include `timestamp` (ISO 8601), `flagKey`, `variantKey`, `flagType`, `reason`, `contextKey`, `ruleIndex`. | Status: not_done
- [ ] **Define `ConfigChangeEvent` interface** — Include `timestamp` (ISO 8601), `added: string[]`, `modified: string[]`, `removed: string[]`. | Status: not_done
- [x] **Define `SegmentDefinition` interface** — Include `description?` and `conditions: RuleCondition[]`. | Status: done
- [ ] **Define `FlagConfiguration` interface** — Top-level config shape: `version: number`, `description?`, `updatedAt?`, `segments?`, `flags: Record<string, FlagDefinition>`, `environments?`. | Status: not_done
- [ ] **Define `EnvironmentOverride` interface** — Shape for per-environment flag overrides: `flags: Record<string, Partial<FlagDefinition>>`. | Status: not_done
- [ ] **Define `FlagClient` interface** — All public API methods: `getPrompt`, `getModel`, `getConfig`, `isEnabled`, `evaluate`, `allFlags`, `getFlagKeys`, `getFlag`, `getSegments`, `overrideForTest`, `overrideValueForTest`, `clearOverride`, `clearAllOverrides`, `reload`, `dispose`. | Status: not_done

---

## Phase 1: Error Classes (`src/errors.ts`)

- [x] **Implement `FlagError` base class** — Extends `Error`. Add a `readonly code: string` property. | Status: done
- [x] **Implement `FlagNotFoundError`** — Extends `FlagError`. Code: `'FLAG_NOT_FOUND'`. Include `readonly flagKey: string`. | Status: done
- [x] **Implement `FlagTypeMismatchError`** — Extends `FlagError`. Code: `'FLAG_TYPE_MISMATCH'`. Include `readonly flagKey`, `expectedType`, `actualType`. | Status: done
- [ ] **Implement `FlagConfigError`** — Extends `FlagError`. Code: `'FLAG_CONFIG_ERROR'`. Include `readonly configPath?` and `validationErrors: string[]`. | Status: not_done
- [x] **Implement `VariantNotFoundError`** — Extends `FlagError`. Code: `'VARIANT_NOT_FOUND'`. Include `readonly flagKey`, `variantKey`. | Status: done
- [ ] **Implement `SegmentNotFoundError`** — Extends `FlagError`. Code: `'SEGMENT_NOT_FOUND'`. Include `readonly flagKey`, `segmentKey`. | Status: not_done
- [ ] **Implement `ClientDisposedError`** — Extends `FlagError`. Code: `'CLIENT_DISPOSED'`. | Status: not_done

---

## Phase 1: Hash Function (`src/hash.ts`)

- [x] **Implement `computeBucket` function** — Takes `contextKey: string` and `flagKey: string`. Computes `murmurhash3_x86_32(contextKey + "/" + flagKey) % 10000`. Returns an integer in `[0, 9999]`. Import `murmurhash3js` for the hash computation. | Status: done

---

## Phase 1: Context Utilities (`src/utils/context.ts`)

- [x] **Implement `resolveAttribute` function** — Given an `EvaluationContext` and an attribute path string (e.g., `"plan"`, `"custom.betaTester"`), resolve the value from the context using dot-notation traversal. Return `undefined` if the path does not resolve. | Status: done
- [x] **Implement `mergeContexts` function** — Merge a default context with a per-evaluation context. Per-evaluation fields override defaults. Handle nested `custom` object merging. | Status: done
- [ ] **Implement `validateContext` function** — Validate the context: warn if `key` is missing or empty (generate random key via `crypto.randomUUID()`), coerce non-string `key` to string, warn on invalid `custom` value types. | Status: not_done

---

## Phase 1: Condition Evaluator (`src/evaluator/condition-evaluator.ts`)

- [x] **Implement operator dispatch** — Create a function `evaluateCondition(condition: RuleCondition, context: EvaluationContext): boolean` that resolves the attribute from the context, dispatches to the appropriate operator handler, and applies `negate` if set. | Status: done
- [x] **Implement `equals` operator** — Exact equality comparison (`===`) for string, number, boolean values. Return `false` if attribute is missing. | Status: done
- [x] **Implement `notEquals` operator** — Negated equality comparison. Return `false` if attribute is missing. | Status: done
- [x] **Implement `in` operator** — Check if the context attribute value is in the `values` array. Return `false` if attribute is missing. | Status: done
- [x] **Implement `notIn` operator** — Check if the context attribute value is NOT in the `values` array. Return `false` if attribute is missing. | Status: done
- [x] **Implement `contains` operator** — String substring check. Return `false` if attribute is missing or not a string. | Status: done
- [x] **Implement `startsWith` operator** — String prefix check. Return `false` if attribute is missing or not a string. | Status: done
- [x] **Implement `endsWith` operator** — String suffix check. Return `false` if attribute is missing or not a string. | Status: done
- [x] **Implement `greaterThan` operator** — Numeric greater-than comparison. Return `false` if attribute is missing or not a number. | Status: done
- [x] **Implement `lessThan` operator** — Numeric less-than comparison. Return `false` if attribute is missing or not a number. | Status: done
- [x] **Implement `greaterThanOrEqual` operator** — Numeric >= comparison. Return `false` if attribute is missing or not a number. | Status: done
- [x] **Implement `lessThanOrEqual` operator** — Numeric <= comparison. Return `false` if attribute is missing or not a number. | Status: done
- [x] **Implement `matches` operator** — Regex match using `new RegExp(value).test(attribute)`. Return `false` if attribute is missing or not a string. Handle invalid regex gracefully (return `false`, emit error). | Status: done
- [x] **Implement `exists` operator** — Return `true` if the attribute is present and not null/undefined. | Status: done
- [x] **Implement `notExists` operator** — Return `true` if the attribute is absent, null, or undefined. | Status: done
- [ ] **Implement `semverEquals` operator** — Parse both sides as `MAJOR.MINOR.PATCH` and compare for equality. Return `false` if either side is not valid semver. | Status: not_done
- [ ] **Implement `semverGreaterThan` operator** — Semver greater-than comparison. Return `false` if either side is not valid semver. | Status: not_done
- [ ] **Implement `semverLessThan` operator** — Semver less-than comparison. Return `false` if either side is not valid semver. | Status: not_done
- [ ] **Implement inline semver parser** — Minimal parser for `MAJOR.MINOR.PATCH` format. No dependency on a semver library. Return parsed `[major, minor, patch]` tuple or null for invalid input. | Status: not_done
- [x] **Handle missing attributes in conditions** — For all operators except `exists`/`notExists`, return `false` when the referenced attribute is not present in the context (fail-safe behavior). | Status: done

---

## Phase 1: Segment Resolver (`src/evaluator/segment-resolver.ts`)

- [ ] **Implement `resolveSegment` function** — Given a segment name and the segments map, return the segment's conditions array. Throw `SegmentNotFoundError` if the segment does not exist. | Status: not_done
- [ ] **Implement segment condition evaluation** — Evaluate all conditions in a segment against a context (AND logic). Return boolean. | Status: not_done

---

## Phase 1: Rollout Engine (`src/evaluator/rollout.ts`)

- [x] **Implement `selectVariantFromRollout` function** — Given a rollout array `[{ variant, weight }]`, a context key, and a flag key, compute the bucket via `computeBucket`, normalize weights to 10000 buckets, and select the variant whose cumulative boundary first exceeds the bucket value. | Status: done
- [x] **Handle weight normalization** — Compute `totalWeight = sum of all weights`. For each variant, compute cumulative boundary as `cumulativeWeight * 10000 / totalWeight`. Handle edge case where totalWeight is 0 (return first variant or default). | Status: done
- [x] **Handle single-variant rollout** — If rollout has a single variant at weight 100 (or any weight), always return that variant. | Status: done

---

## Phase 1: Rule Matcher (`src/evaluator/rule-matcher.ts`)

- [x] **Implement `matchRules` function** — Given a flag's rules array, an evaluation context, and the segments map, evaluate rules in order (first-match-wins). For each rule: evaluate segment conditions (if segment is referenced), evaluate inline conditions, AND all conditions together. Return the matching rule's serve directive and rule index, or null if no rule matches. | Status: done
- [ ] **Handle rules with both segment and inline conditions** — When a rule has both `segment` and `conditions`, all segment conditions AND all inline conditions must be true. | Status: not_done
- [x] **Handle empty conditions** — A rule with empty or omitted `conditions` array (and no segment) matches all contexts (catch-all rule). | Status: done
- [x] **Handle serve directive resolution** — For a fixed variant serve (`{ variant: string }`), return the variant key directly. For a rollout serve (`{ rollout: [...] }`), delegate to the rollout engine. | Status: done

---

## Phase 1: Evaluation Entry Point (`src/evaluator/index.ts`)

- [x] **Implement `evaluateFlag` function** — Given a flag definition, evaluation context, and segments map, orchestrate the full evaluation: check if flag is enabled (return default with reason `'disabled'` if not), match rules, resolve rollout if needed, look up variant value, return `EvaluationResult`. | Status: done
- [x] **Handle disabled flags** — If `flag.enabled === false`, return the default variant with reason `'disabled'`. | Status: done
- [x] **Handle no rule match** — If no rule matches, return the default variant with reason `'default'`. | Status: done
- [x] **Handle evaluation errors** — Wrap rule evaluation in try/catch. On error, return the default variant with reason `'error'` and emit error via `onError`. | Status: done

---

## Phase 1: Configuration Loader (`src/config/loader.ts`)

- [ ] **Implement JSON file loading** — Read a JSON file from `configPath` using `node:fs/promises.readFileSync` (synchronous for `createClient`). Parse with `JSON.parse`. Wrap parse errors in `FlagConfigError`. | Status: not_done
- [ ] **Implement file existence check** — Check that `configPath` exists before reading. Throw `FlagConfigError` with descriptive message if not found. | Status: not_done
- [ ] **Detect file format by extension** — Check `.json`, `.yaml`, `.yml` extensions on `configPath` to determine parser. Default to JSON for unknown extensions. | Status: not_done
- [x] **Support inline configuration** — When `config` is provided instead of `configPath`, use the inline object directly (skip file loading). | Status: done
- [ ] **Validate mutual exclusivity** — Throw `FlagConfigError` if both `configPath` and `config` are provided, or if neither is provided. | Status: not_done

---

## Phase 1: Configuration Validator (`src/config/validator.ts`)

- [ ] **Implement top-level validation** — Validate that `version` is present and is a recognized schema version (currently `1`). Validate that `flags` is present and is an object. | Status: not_done
- [ ] **Validate flag structure** — For each flag, validate: `type` is one of `'prompt'`, `'model'`, `'config'`, `'boolean'`; `enabled` is a boolean; `variants` is a non-empty object; `defaultVariant` is a string that references a key in `variants`; `rules` is an array. | Status: not_done
- [ ] **Validate boolean flag constraints** — Boolean flags must have exactly two variants with values `true` and `false`. | Status: not_done
- [ ] **Validate model flag constraints** — Every model flag variant value must be an object with a `model` string field. | Status: not_done
- [ ] **Validate prompt flag constraints** — Every prompt flag variant value must be a string. | Status: not_done
- [ ] **Validate config flag constraints** — Every config flag variant value must be a JSON object (not null, not array, not primitive). | Status: not_done
- [ ] **Validate rule variant references** — Every `serve.variant` in a rule must reference a defined variant in the same flag. Every `serve.rollout[].variant` must reference a defined variant. | Status: not_done
- [ ] **Validate rule segment references** — Every `segment` in a rule must reference a defined segment in `segments`. | Status: not_done
- [ ] **Validate rollout weights** — All rollout weights must be non-negative numbers. | Status: not_done
- [ ] **Validate condition operators** — Every operator in a condition must be a valid `ComparisonOperator`. | Status: not_done
- [ ] **Validate segment structure** — Each segment must have a `conditions` array. Segment conditions must not reference other segments (no circular references). | Status: not_done
- [ ] **Collect all validation errors** — Validation must collect ALL errors (not fail on the first one) and report them as a `FlagConfigError` with a `validationErrors` array. | Status: not_done

---

## Phase 1: FlagClient Implementation (`src/client.ts`)

- [x] **Implement `FlagClient` class** — Internal class holding configuration, segments map, overrides map, disposed state, and event callbacks. | Status: done
- [x] **Implement `evaluate<T>` method** — Evaluate any flag by key: look up flag, validate context, merge default context, delegate to evaluator, emit evaluation event, return `EvaluationResult<T>`. Throw `FlagNotFoundError` if key not found. Throw `ClientDisposedError` if disposed. | Status: done
- [x] **Implement `getPrompt` method** — Call `evaluate`, assert flag type is `'prompt'`, throw `FlagTypeMismatchError` if not. Return the string value. | Status: done
- [x] **Implement `getModel` method** — Call `evaluate`, assert flag type is `'model'`, throw `FlagTypeMismatchError` if not. Return the `ModelConfig` value. | Status: done
- [x] **Implement `getConfig<T>` method** — Call `evaluate`, assert flag type is `'config'`, throw `FlagTypeMismatchError` if not. Return the typed config value. | Status: done
- [x] **Implement `isEnabled` method** — Call `evaluate`, assert flag type is `'boolean'`, throw `FlagTypeMismatchError` if not. Return the boolean value. | Status: done
- [ ] **Implement `allFlags` method** — Iterate all flag keys, evaluate each, return `Record<string, EvaluationResult>`. | Status: not_done
- [x] **Implement `getFlagKeys` method** — Return array of all flag keys in the configuration. | Status: done
- [x] **Implement `getFlag` method** — Return the `FlagDefinition` for a given key, or `null` if not found. | Status: done
- [ ] **Implement `getSegments` method** — Return the segments map. | Status: not_done
- [x] **Implement evaluation event emission** — After every evaluation, call `onEvaluation` callback (if provided) with an `EvaluationEvent` containing: `timestamp` (ISO 8601), `flagKey`, `variantKey`, `flagType`, `reason`, `contextKey`, `ruleIndex`. | Status: done
- [x] **Implement error event emission** — On evaluation errors, call `onError` callback (if provided, else `console.error`) with a `FlagError`. | Status: done

---

## Phase 1: `createClient` Factory (`src/index.ts`)

- [x] **Implement `createClient` function** — Accept `FlagClientConfig`, load config (from file or inline), validate, create and return `FlagClient` instance. Throw `FlagConfigError` on validation failure. | Status: done
- [x] **Export all public types** — Re-export all types, interfaces, error classes, and the `createClient` function from `src/index.ts`. | Status: done

---

## Phase 1: Unit Tests — Condition Evaluator

- [ ] **Test `equals` operator** — Matching and non-matching string, number, boolean values. Missing attribute returns `false`. | Status: not_done
- [ ] **Test `notEquals` operator** — Matching and non-matching values. Missing attribute returns `false`. | Status: not_done
- [ ] **Test `in` operator** — Value in set, value not in set, missing attribute. | Status: not_done
- [ ] **Test `notIn` operator** — Value not in set, value in set, missing attribute. | Status: not_done
- [ ] **Test `contains` operator** — Substring present, substring absent, non-string attribute, missing attribute. | Status: not_done
- [ ] **Test `startsWith` operator** — Matching prefix, non-matching prefix, missing attribute. | Status: not_done
- [ ] **Test `endsWith` operator** — Matching suffix, non-matching suffix, missing attribute. | Status: not_done
- [ ] **Test `greaterThan` operator** — Greater, equal, less, non-numeric attribute, missing attribute. | Status: not_done
- [ ] **Test `lessThan` operator** — Less, equal, greater, non-numeric attribute, missing attribute. | Status: not_done
- [ ] **Test `greaterThanOrEqual` operator** — GTE, less, missing attribute. | Status: not_done
- [ ] **Test `lessThanOrEqual` operator** — LTE, greater, missing attribute. | Status: not_done
- [ ] **Test `matches` operator** — Matching regex, non-matching regex, invalid regex (returns false), missing attribute. | Status: not_done
- [ ] **Test `exists` operator** — Attribute present returns `true`, attribute absent returns `false`, attribute null returns `false`. | Status: not_done
- [ ] **Test `notExists` operator** — Attribute absent returns `true`, attribute present returns `false`. | Status: not_done
- [ ] **Test `semverEquals` operator** — Equal versions, unequal versions, invalid semver. | Status: not_done
- [ ] **Test `semverGreaterThan` operator** — Greater, equal, less, invalid semver. | Status: not_done
- [ ] **Test `semverLessThan` operator** — Less, equal, greater, invalid semver. | Status: not_done
- [ ] **Test `negate` option** — Verify that `negate: true` inverts the result of any operator. | Status: not_done
- [ ] **Test dot-notation attribute access** — Conditions referencing `custom.betaTester`, `custom.requestCount`, etc. | Status: not_done
- [ ] **Test type mismatch handling** — String attribute compared with `greaterThan` (numeric operator) returns `false`. | Status: not_done

---

## Phase 1: Unit Tests — Rule Matcher

- [x] **Test single-condition rule match** — Rule with one condition that matches. | Status: done
- [ ] **Test multi-condition AND logic** — Rule with multiple conditions: all match (pass), one fails (fail). | Status: not_done
- [ ] **Test first-match-wins ordering** — Three rules where the first matches; verify second and third are not selected. | Status: not_done
- [x] **Test empty conditions catch-all** — Rule with empty conditions array matches all contexts. | Status: done
- [x] **Test empty rules array** — No rules defined; default variant should be served. | Status: done
- [ ] **Test rule with segment reference** — Rule referencing a segment; segment conditions match and don't match. | Status: not_done
- [ ] **Test rule with both segment and inline conditions** — Both must match. | Status: not_done
- [ ] **Test invalid segment reference** — Rule references a segment that doesn't exist; expect `SegmentNotFoundError`. | Status: not_done

---

## Phase 1: Unit Tests — Rollout

- [x] **Test deterministic bucketing** — Same `key + flagKey` always produces the same variant. | Status: done
- [ ] **Test bucketing independence** — Different flag keys produce different variants for the same user key. | Status: not_done
- [ ] **Test weight distribution** — Simulate 100,000 random keys for a 70/30 rollout; verify distribution is within 1% tolerance. | Status: not_done
- [x] **Test 50/50 split** — Equal-weight rollout distributes approximately evenly. | Status: done
- [ ] **Test single-variant rollout (100%)** — All users receive the single variant. | Status: not_done
- [ ] **Test zero-weight variant** — Variant with weight 0 receives no traffic. | Status: not_done
- [ ] **Test rollout weights that do not sum to 100** — E.g., weights 1, 2, 3 (sum 6) should still distribute proportionally. | Status: not_done
- [ ] **Test rollout weights that sum to 0** — Degenerate case; should handle gracefully (return first variant or default). | Status: not_done

---

## Phase 1: Unit Tests — Hash Function

- [ ] **Test stable hash output** — Known input/output pairs for regression testing. | Status: not_done
- [ ] **Test empty string input** — `computeBucket("", "flag")` produces a valid bucket in `[0, 9999]`. | Status: not_done
- [ ] **Test very long string input** — Long key + flag key still produces valid bucket. | Status: not_done
- [ ] **Test bucket range** — Bucket is always in `[0, 9999]`. | Status: not_done

---

## Phase 1: Unit Tests — Configuration Validator

- [ ] **Test valid configuration passes** — A fully valid config with all flag types, segments, and rules passes validation. | Status: not_done
- [ ] **Test missing `version` field** — Validation error reported. | Status: not_done
- [ ] **Test invalid `version` value** — Unrecognized version number fails. | Status: not_done
- [ ] **Test missing `flags` field** — Validation error reported. | Status: not_done
- [ ] **Test invalid flag type** — Flag with `type: "unknown"` fails validation. | Status: not_done
- [ ] **Test missing `defaultVariant`** — Flag without `defaultVariant` fails. | Status: not_done
- [ ] **Test `defaultVariant` referencing undefined variant** — Validation error reported. | Status: not_done
- [ ] **Test rule referencing undefined variant** — `serve.variant` pointing to nonexistent variant fails. | Status: not_done
- [ ] **Test rollout referencing undefined variant** — `serve.rollout[].variant` pointing to nonexistent variant fails. | Status: not_done
- [ ] **Test rule referencing undefined segment** — `segment` referencing nonexistent segment fails. | Status: not_done
- [ ] **Test negative rollout weight** — Validation error reported. | Status: not_done
- [ ] **Test invalid operator in condition** — Condition with `operator: "foobar"` fails. | Status: not_done
- [ ] **Test boolean flag with wrong number of variants** — More or fewer than 2 variants fails. | Status: not_done
- [ ] **Test boolean flag with wrong variant values** — Variants not `true`/`false` fails. | Status: not_done
- [ ] **Test model flag missing `model` field** — Variant value without `model` string fails. | Status: not_done
- [ ] **Test prompt flag with non-string variant value** — Fails validation. | Status: not_done
- [ ] **Test config flag with non-object variant value** — Fails validation. | Status: not_done
- [ ] **Test all errors collected** — Multiple validation issues are all reported in `validationErrors`, not just the first. | Status: not_done

---

## Phase 1: Unit Tests — Configuration Loader

- [ ] **Test loading from JSON file** — Valid JSON file loads successfully. | Status: not_done
- [x] **Test loading from inline config** — Inline `config` object loads successfully. | Status: done
- [ ] **Test file-not-found error** — Nonexistent `configPath` throws `FlagConfigError`. | Status: not_done
- [ ] **Test JSON parse error** — Malformed JSON (e.g., trailing comma) throws `FlagConfigError`. | Status: not_done
- [ ] **Test mutual exclusivity** — Both `configPath` and `config` provided throws error. Neither provided throws error. | Status: not_done

---

## Phase 1: Unit Tests — Error Classes

- [x] **Test `FlagNotFoundError` properties** — Verify `code`, `flagKey`, `message`. | Status: done
- [x] **Test `FlagTypeMismatchError` properties** — Verify `code`, `flagKey`, `expectedType`, `actualType`. | Status: done
- [ ] **Test `FlagConfigError` properties** — Verify `code`, `configPath`, `validationErrors`. | Status: not_done
- [ ] **Test `VariantNotFoundError` properties** — Verify `code`, `flagKey`, `variantKey`. | Status: not_done
- [ ] **Test `SegmentNotFoundError` properties** — Verify `code`, `flagKey`, `segmentKey`. | Status: not_done
- [ ] **Test `ClientDisposedError` properties** — Verify `code`. | Status: not_done
- [ ] **Test all errors extend `FlagError`** — `instanceof FlagError` returns `true` for all error types. | Status: not_done

---

## Phase 1: Unit Tests — Client

- [x] **Test `getPrompt` returns prompt string** — Prompt flag evaluated correctly. | Status: done
- [x] **Test `getPrompt` throws on wrong type** — Calling `getPrompt` on a model flag throws `FlagTypeMismatchError`. | Status: done
- [x] **Test `getModel` returns `ModelConfig`** — Model flag evaluated correctly. | Status: done
- [x] **Test `getModel` throws on wrong type** — Calling `getModel` on a prompt flag throws `FlagTypeMismatchError`. | Status: done
- [x] **Test `getConfig` returns typed config** — Config flag evaluated correctly. | Status: done
- [x] **Test `isEnabled` returns boolean** — Boolean flag evaluated correctly. | Status: done
- [ ] **Test `isEnabled` throws on wrong type** — Calling `isEnabled` on a prompt flag throws `FlagTypeMismatchError`. | Status: not_done
- [x] **Test `evaluate` returns full `EvaluationResult`** — All fields populated correctly. | Status: done
- [ ] **Test `allFlags` returns all evaluations** — Every flag in config is evaluated and returned. | Status: not_done
- [x] **Test `getFlagKeys` returns all keys** — Returns all flag key strings. | Status: done
- [x] **Test `getFlag` returns flag definition** — Returns definition for known key, null for unknown. | Status: done
- [ ] **Test `getSegments` returns segments** — Returns the segments map. | Status: not_done
- [x] **Test flag not found throws `FlagNotFoundError`** — Evaluating a nonexistent flag key throws. | Status: done
- [x] **Test disabled flag returns default with reason `'disabled'`** — Flag with `enabled: false` returns default variant. | Status: done
- [x] **Test default variant returned when no rule matches** — Reason is `'default'`. | Status: done
- [ ] **Test context with missing key generates warning** — Missing `key` triggers warning and random key generation. | Status: not_done
- [ ] **Test default context merging** — Default context attributes are overridden by per-evaluation context. | Status: not_done

---

## Phase 1: Integration Tests (`src/__tests__/integration.test.ts`)

- [ ] **Test full evaluation pipeline** — Load a configuration with multiple flag types, segments, and rules. Evaluate each flag with different contexts. Verify correct variant selection for each case. | Status: not_done
- [ ] **Test prompt A/B test simulation** — 50/50 rollout with 10,000 random keys. Verify approximately 50/50 distribution (within 2% tolerance). Verify same key always returns same variant. | Status: not_done
- [ ] **Test model migration simulation** — Ramp-up from 10% to 50%. Verify original 10% users remain on same variant after weight change. | Status: not_done
- [ ] **Test segment targeting across multiple flags** — Three segments, multiple flags targeting each segment. Verify correct variant for each segment-context pair. | Status: not_done

---

## Phase 1: Test Fixtures

- [ ] **Create `valid-config.json` fixture** — Complete, valid configuration with all flag types (prompt, model, config, boolean), segments, and targeting rules. | Status: not_done
- [ ] **Create `missing-version.json` fixture** — Config missing the `version` field. | Status: not_done
- [ ] **Create `invalid-flag-type.json` fixture** — Config with an invalid flag type value. | Status: not_done
- [ ] **Create `bad-variant-ref.json` fixture** — Config where a rule references a nonexistent variant. | Status: not_done
- [ ] **Create `bad-segment-ref.json` fixture** — Config where a rule references a nonexistent segment. | Status: not_done

---

## Phase 2: Test Overrides

- [x] **Implement `overrideForTest` method** — Store a mapping from flag key to variant key. When an override is active, `evaluate` returns the overridden variant's value with reason `'override'`. | Status: done
- [ ] **Implement `overrideValueForTest` method** — Store a mapping from flag key to an arbitrary value. When active, `evaluate` returns the overridden value with reason `'override'`. | Status: not_done
- [x] **Implement `clearOverride` method** — Remove the override for a specific flag key. | Status: done
- [x] **Implement `clearAllOverrides` method** — Remove all overrides. | Status: done
- [x] **Test `overrideForTest` with valid variant** — Override returns the specified variant value. | Status: done
- [ ] **Test `overrideValueForTest` with arbitrary value** — Override returns the arbitrary value. | Status: not_done
- [x] **Test overrides take precedence over rules** — With an override set, targeting rules are skipped. | Status: done
- [x] **Test `clearOverride` removes single override** — After clearing, normal evaluation resumes for that flag. | Status: done
- [x] **Test `clearAllOverrides` removes all overrides** — After clearing, normal evaluation resumes for all flags. | Status: done
- [x] **Test evaluation reason is `'override'`** — When an override is active, the result reason is `'override'`. | Status: done

---

## Phase 2: Evaluation Events

- [ ] **Implement `EvaluationEvent` emission** — After every evaluation, construct and emit an `EvaluationEvent` via the `onEvaluation` callback. Include `timestamp`, `flagKey`, `variantKey`, `flagType`, `reason`, `contextKey`, `ruleIndex`. | Status: not_done
- [ ] **Test event emission for `rule_match` reason** — Verify correct `ruleIndex` and `variantKey`. | Status: not_done
- [ ] **Test event emission for `default` reason** — `ruleIndex` is `-1`. | Status: not_done
- [ ] **Test event emission for `disabled` reason** — `ruleIndex` is `-1`. | Status: not_done
- [ ] **Test event emission for `override` reason** — `ruleIndex` is `-1`. | Status: not_done
- [ ] **Test event emission for `error` reason** — Error event emitted, `ruleIndex` is `-1`. | Status: not_done
- [ ] **Test that `contextKey` is included but full context is not** — Only the `key` field is present in the event. | Status: not_done

---

## Phase 2: Semver Operators (if not already done in Phase 1)

- [ ] **Ensure semver operators are fully implemented and tested** — `semverEquals`, `semverGreaterThan`, `semverLessThan` with the inline parser. Cover valid versions, invalid versions, and edge cases (e.g., `1.0.0` vs `1.0.0`). | Status: not_done

---

## Phase 2: CLI Entry Point (`src/cli.ts`)

- [ ] **Implement CLI argument parsing** — Use `node:util.parseArgs` to parse command and options. Support `--config`, `--version`, `--help`, and command-specific options. | Status: not_done
- [ ] **Implement command dispatch** — Route to the appropriate command handler based on the first positional argument: `list`, `evaluate`, `validate`, `inspect`, `distribution`. | Status: not_done
- [ ] **Implement `--version` flag** — Print the package version from `package.json` and exit with code 0. | Status: not_done
- [ ] **Implement `--help` flag** — Print usage text with all commands and their options, then exit with code 0. | Status: not_done
- [ ] **Implement exit codes** — Exit `0` for success, `1` for evaluation/flag errors, `2` for configuration errors. | Status: not_done
- [ ] **Implement environment variable support** — Read `PROMPT_FLAGS_CONFIG` for `--config`, `PROMPT_FLAGS_ENVIRONMENT` for `--environment`, `NO_COLOR` for disabling color output. | Status: not_done

---

## Phase 2: CLI `list` Command (`src/cli/list.ts`)

- [ ] **Implement `list` command** — Load config, enumerate all flags, display as a formatted table with columns: KEY, TYPE, ENABLED, VARIANTS (count), RULES (count), DESCRIPTION. Show summary line (total flags, enabled, disabled). | Status: not_done
- [ ] **Implement `--type` filter** — Filter flags by type (prompt, model, config, boolean). | Status: not_done
- [ ] **Implement `--tag` filter** — Filter flags by tag. | Status: not_done
- [ ] **Implement `--enabled-only` filter** — Only show enabled flags. | Status: not_done
- [ ] **Implement `--json` output** — Output the flag list as JSON instead of a table. | Status: not_done

---

## Phase 2: CLI `evaluate` Command (`src/cli/evaluate.ts`)

- [ ] **Implement `evaluate` command** — Accept a flag key as positional argument. Build evaluation context from CLI options. Evaluate the flag. Display the result: flag key, type, enabled status, variant, reason, and value. | Status: not_done
- [ ] **Implement `--context` option** — Accept a JSON string for the full evaluation context. | Status: not_done
- [ ] **Implement shorthand context options** — `--key`, `--plan`, `--region` for quick context building. | Status: not_done
- [ ] **Implement `--environment` option** — Apply environment overrides before evaluation. | Status: not_done
- [ ] **Implement `--json` output** — Output the evaluation result as JSON. | Status: not_done

---

## Phase 2: CLI `validate` Command (`src/cli/validate.ts`)

- [ ] **Implement `validate` command** — Load and validate the configuration file. Report each validation check (schema, flags, segments, variant references, segment references, rollout weights, boolean constraints). Print a success or failure summary. | Status: not_done
- [ ] **Implement `--strict` option** — Treat warnings as errors (e.g., unused segments, flags with no rules). | Status: not_done

---

## Phase 2: CLI `inspect` Command (`src/cli/inspect.ts`)

- [ ] **Implement `inspect` command** — Accept a flag key as positional argument. Display the full flag definition: type, description, enabled status, all variants with their values, all rules with conditions and serve directives, default variant, tags. | Status: not_done

---

## Phase 2: Output Formatting (`src/utils/format.ts`)

- [ ] **Implement table formatter** — Render tabular data with column alignment for CLI output. | Status: not_done
- [ ] **Implement ANSI color helpers** — Colored text using raw ANSI escape codes (no dependency). Respect `NO_COLOR` environment variable and `process.stdout.isTTY` for color detection. | Status: not_done
- [ ] **Implement JSON output helper** — Pretty-print JSON for `--json` mode. | Status: not_done

---

## Phase 2: Unit Tests — CLI

- [ ] **Test `list` command output** — Run against test config, verify table output and summary. | Status: not_done
- [ ] **Test `list --type prompt` filter** — Only prompt flags shown. | Status: not_done
- [ ] **Test `list --json` output** — Valid JSON array output. | Status: not_done
- [ ] **Test `evaluate` command output** — Run against test config with a specific flag and context. Verify variant and reason in output. | Status: not_done
- [ ] **Test `evaluate --json` output** — Valid JSON object output with evaluation result fields. | Status: not_done
- [ ] **Test `validate` command success** — Valid config produces success output and exit code 0. | Status: not_done
- [ ] **Test `validate` command failure** — Invalid config produces error output and exit code 2. | Status: not_done
- [ ] **Test `inspect` command output** — Full flag definition displayed correctly. | Status: not_done
- [ ] **Test `--version` flag** — Prints version and exits 0. | Status: not_done
- [ ] **Test `--help` flag** — Prints help text and exits 0. | Status: not_done
- [ ] **Test exit codes** — Code 0 on success, 1 on flag error, 2 on config error. | Status: not_done

---

## Phase 3: Hot Reload — File Watcher (`src/config/watcher.ts`)

- [ ] **Implement file watcher** — Use `node:fs.watch()` to watch the configuration file for changes. On change, trigger a debounced reload. | Status: not_done
- [ ] **Implement debounce logic** — Coalesce rapid successive file change events within `hotReloadDebounceMs` (default 500ms) into a single reload. | Status: not_done
- [ ] **Implement reload on file change** — Read the file, parse, validate. If valid, atomically replace the in-memory configuration (single reference assignment). If invalid, reject the new config, keep the old one, emit error. | Status: not_done
- [ ] **Implement change diff computation** — Compare old and new configurations to determine added, modified, and removed flag keys. A flag is modified if its JSON serialization differs. Track segment changes: if a segment changes, mark all flags referencing it as modified. | Status: not_done
- [ ] **Emit `ConfigChangeEvent`** — Call `onConfigChange` callback with the diff (added, modified, removed flag keys) and timestamp. | Status: not_done
- [ ] **Handle invalid file changes gracefully** — If the new file fails validation, keep the old config, call `onError`, and continue operating normally. | Status: not_done
- [ ] **Stop watcher on `dispose()`** — Close the file watcher when the client is disposed. | Status: not_done

---

## Phase 3: Client Lifecycle

- [ ] **Implement `reload` method** — Manually trigger a configuration reload from disk. Re-read, parse, validate, and swap. Emit `ConfigChangeEvent`. | Status: not_done
- [ ] **Implement `dispose` method** — Stop the file watcher (if hot reload is active), mark the client as disposed. All subsequent evaluation calls should throw `ClientDisposedError`. | Status: not_done
- [ ] **Test `dispose` stops file watching** — After dispose, file changes do not trigger reloads. | Status: not_done
- [ ] **Test evaluation after dispose throws `ClientDisposedError`** — All methods (`getPrompt`, `getModel`, `getConfig`, `isEnabled`, `evaluate`, `allFlags`) throw after dispose. | Status: not_done
- [ ] **Test `reload` refreshes configuration** — Modify config file, call `reload`, verify new values. | Status: not_done

---

## Phase 3: Environment Override Merging (`src/config/merger.ts`)

- [ ] **Implement environment override merging** — Given the base configuration and an environment name, deep-merge the environment-specific overrides from `environments[env].flags` onto the base flag definitions. Only overridden fields change; all other fields retain base values. | Status: not_done
- [ ] **Support overridable fields** — `enabled`, `defaultVariant`, `rules`, and individual variant values can be overridden per-environment. | Status: not_done
- [ ] **Test environment merging with overridden rules** — Environment overrides rules; base variants and other fields preserved. | Status: not_done
- [ ] **Test environment merging with overridden `enabled`** — Flag disabled in environment, enabled in base. | Status: not_done
- [ ] **Test environment merging with overridden `defaultVariant`** — Different default in environment vs base. | Status: not_done
- [ ] **Test environment not found** — If specified environment is not in `environments`, use base config with no overrides (no error). | Status: not_done

---

## Phase 3: YAML Support (`src/config/yaml-parser.ts`)

- [ ] **Implement minimal YAML parser** — Parse the subset of YAML used for flag configuration: objects, arrays, strings, numbers, booleans. No support for anchors, multi-document streams, or custom tags. | Status: not_done
- [ ] **Integrate YAML loading in config loader** — When `configPath` ends in `.yaml` or `.yml`, use the YAML parser instead of `JSON.parse`. | Status: not_done
- [ ] **Test YAML loading** — Load a valid YAML config file and verify it produces the same result as the equivalent JSON. | Status: not_done
- [ ] **Test YAML parse error** — Malformed YAML throws `FlagConfigError`. | Status: not_done

---

## Phase 3: CLI `distribution` Command (`src/cli/distribution.ts`)

- [ ] **Implement `distribution` command** — Accept a flag key. Generate N random user keys (default 10,000). Evaluate the flag for each. Report variant distribution: target percentage, actual percentage, deviation. | Status: not_done
- [ ] **Implement `--samples` option** — Configure the number of simulated users. | Status: not_done
- [ ] **Implement `--json` output** — Output distribution results as JSON. | Status: not_done
- [ ] **Test distribution command output** — Verify table format with TARGET, ACTUAL, DEVIATION columns. | Status: not_done
- [ ] **Test distribution with `--json`** — Valid JSON output with distribution data. | Status: not_done

---

## Phase 3: Unit Tests — Hot Reload

- [ ] **Test file change triggers configuration reload** — Modify file, wait for debounce, verify new config is active. | Status: not_done
- [ ] **Test debounce coalesces rapid writes** — Multiple rapid writes result in a single reload. | Status: not_done
- [ ] **Test invalid file changes are rejected** — Write invalid config, verify old config is retained, `onError` is called. | Status: not_done
- [ ] **Test `ConfigChangeEvent` emission** — Verify `added`, `modified`, `removed` fields are correct after a file change. | Status: not_done
- [ ] **Test atomic configuration swap** — During reload, evaluations consistently see either the old or new config, never a mix. | Status: not_done

---

## Phase 3: Integration Tests — Hot Reload End-to-End

- [ ] **Test hot reload end-to-end** — Create client with hot reload pointing at a temp file. Evaluate flag. Modify file (change variant value). Wait for debounce. Evaluate again. Verify new value. Verify `onConfigChange` called. | Status: not_done

---

## Phase 3: Integration Tests — Environment Overrides

- [ ] **Test environment override end-to-end** — Create client with `environment: 'staging'`. Verify overridden properties use staging values. Verify non-overridden properties use base values. | Status: not_done

---

## Phase 3: Integration Tests — CLI End-to-End

- [ ] **Test CLI `list` end-to-end** — Run the actual CLI binary against a test config file, verify stdout output. | Status: not_done
- [ ] **Test CLI `evaluate` end-to-end** — Run CLI binary with flag key and context options, verify output. | Status: not_done
- [ ] **Test CLI `validate` end-to-end** — Run CLI binary against valid and invalid configs, verify output and exit codes. | Status: not_done
- [ ] **Test CLI `inspect` end-to-end** — Run CLI binary with a flag key, verify output. | Status: not_done
- [ ] **Test CLI `distribution` end-to-end** — Run CLI binary, verify distribution output. | Status: not_done

---

## Phase 4: Edge Case Tests

- [ ] **Test empty configuration (no flags)** — `getFlagKeys()` returns empty array. Evaluating any key throws `FlagNotFoundError`. | Status: not_done
- [ ] **Test flag with no rules (only default)** — Default variant returned with reason `'default'`. | Status: not_done
- [ ] **Test flag with a single variant** — Single variant always returned. | Status: not_done
- [ ] **Test context with only `key`** — No other attributes. Targeting rules that reference missing attributes don't match. | Status: not_done
- [ ] **Test context with empty string `key`** — Warning emitted, random key generated. | Status: not_done
- [ ] **Test context with `null` or `undefined`** — Default variant returned with reason `'error'`. | Status: not_done
- [ ] **Test flag key with special characters** — Dots, slashes, spaces in flag keys. | Status: not_done
- [ ] **Test variant value that is an extremely large string** — 1 MB prompt variant value. | Status: not_done
- [ ] **Test 100+ flags in configuration** — Performance: `allFlags()` completes in under 50ms. | Status: not_done
- [ ] **Test rollout weights summing to 0** — Degenerate case handled gracefully. | Status: not_done
- [ ] **Test rollout with single variant at weight 100** — Always returns that variant. | Status: not_done
- [ ] **Test JSON parse error from trailing comma** — Proper `FlagConfigError` thrown. | Status: not_done
- [ ] **Test valid JSON that fails schema validation** — Proper `FlagConfigError` with `validationErrors`. | Status: not_done

---

## Phase 4: Performance Benchmarks

- [ ] **Benchmark single flag evaluation speed** — Measure time for a single `evaluate()` call on a flag with 5 rules, 2 conditions each. Target: under 10 microseconds. | Status: not_done
- [ ] **Benchmark `allFlags()` with 100 flags** — Measure time for evaluating all flags. Target: under 1ms. | Status: not_done
- [ ] **Benchmark configuration loading** — Measure time for loading a config with 50 flags, 10 segments, 200 rules. Target: under 10ms. | Status: not_done
- [ ] **Measure memory footprint** — Estimate memory usage for a config with 50 flags, 3 variants each (500 bytes average). Target: under 1 MB. | Status: not_done

---

## Phase 4: Documentation

- [ ] **Write README.md** — Include: overview, installation, quick start, configuration format reference, API reference (`createClient`, `getPrompt`, `getModel`, `getConfig`, `isEnabled`, `evaluate`, `allFlags`), CLI usage, hot reload, testing support, integration examples (OpenAI, Anthropic, Vercel AI SDK, `prompt-version`, `prompt-inherit`), environment overrides, evaluation events, segments, error handling. | Status: not_done
- [ ] **Add JSDoc comments to all public API** — `createClient`, `FlagClient` interface methods, all type interfaces, all error classes. | Status: not_done
- [ ] **Add inline code comments** — Document non-obvious logic: hash bucketing algorithm, weight normalization, environment merge strategy, YAML parser limitations. | Status: not_done

---

## Phase 4: Final Polish

- [ ] **Verify TypeScript strict mode compiles** — `npm run build` succeeds with `strict: true` in tsconfig. | Status: not_done
- [ ] **Verify all tests pass** — `npm run test` passes with 100% of tests green. | Status: not_done
- [ ] **Verify linting passes** — `npm run lint` passes with no errors. | Status: not_done
- [ ] **Review all public exports from `src/index.ts`** — Ensure every type, interface, error class, and the `createClient` function are exported. No internal implementation details leak. | Status: not_done
- [ ] **Version bump to target version** — Set version in `package.json` appropriately per roadmap phase. | Status: not_done
- [ ] **Verify `npm pack` output** — Run `npm pack --dry-run` to verify only `dist/` files are included (via `"files": ["dist"]` in package.json). Ensure `bin/` is also included. | Status: not_done
- [ ] **Add `bin/` to `files` in `package.json`** — Ensure the CLI binary is included in the published package by adding `"bin"` to the `files` array. | Status: not_done
