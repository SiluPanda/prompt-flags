export type FlagType = 'prompt' | 'model' | 'config' | 'boolean'
export type EvaluationReason = 'rule_match' | 'default' | 'disabled' | 'error' | 'override'
export type ComparisonOperator =
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

export interface EvaluationContext {
  key: string
  plan?: string
  region?: string
  email?: string
  role?: string
  custom?: Record<string, string | number | boolean | string[]>
}

export interface ModelConfig {
  model: string
  temperature?: number
  maxTokens?: number
  [k: string]: unknown
}

export interface RuleCondition {
  attribute: string
  operator: ComparisonOperator
  value?: string | number | boolean
  values?: (string | number)[]
  negate?: boolean
}

export interface TargetingRule {
  description?: string
  conditions?: RuleCondition[]
  serve: { variant: string } | { rollout: Array<{ variant: string; weight: number }> }
}

export interface FlagVariant {
  key: string
  value: unknown
}

export interface FlagDefinition {
  key: string
  type: FlagType
  enabled?: boolean
  variants: FlagVariant[]
  defaultVariant: string
  rules?: TargetingRule[]
}

export interface FlagConfiguration {
  flags: FlagDefinition[]
  segments?: Record<string, { conditions: RuleCondition[] }>
}

export interface EvaluationResult<T = unknown> {
  flagKey: string
  variantKey: string
  value: T
  reason: EvaluationReason
  flagEnabled: boolean
}

export interface FlagClientConfig {
  config: FlagConfiguration
  defaultContext?: Partial<EvaluationContext>
  onEvaluation?: (e: EvaluationResult<unknown>) => void
  onError?: (e: Error) => void
}

export interface FlagClient {
  getPrompt(key: string, ctx: EvaluationContext): string
  getModel(key: string, ctx: EvaluationContext): ModelConfig
  getConfig<T>(key: string, ctx: EvaluationContext): T
  isEnabled(key: string, ctx: EvaluationContext): boolean
  evaluate<T>(key: string, ctx: EvaluationContext): EvaluationResult<T>
  getFlagKeys(): string[]
  getFlag(key: string): FlagDefinition | null
  overrideForTest(key: string, variantKey: string): void
  clearOverride(key: string): void
  clearAllOverrides(): void
}
