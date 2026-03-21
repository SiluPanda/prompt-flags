// prompt-flags - AI-native feature flags for prompt variants and model selection
export { createClient } from './client'
export type {
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
} from './types'
export {
  FlagError,
  FlagNotFoundError,
  FlagTypeMismatchError,
  VariantNotFoundError,
} from './errors'
