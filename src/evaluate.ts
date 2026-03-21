import { FlagDefinition, EvaluationContext, EvaluationResult } from './types'
import { VariantNotFoundError } from './errors'
import { getBucket, selectVariantByRollout } from './bucket'
import { evaluateRule } from './conditions'

export function getVariantValue(flag: FlagDefinition, variantKey: string): unknown {
  const variant = flag.variants.find((v) => v.key === variantKey)
  if (!variant) {
    throw new VariantNotFoundError(flag.key, variantKey)
  }
  return variant.value
}

export function evaluate<T>(
  flag: FlagDefinition,
  ctx: EvaluationContext,
  overrides: Map<string, string>
): EvaluationResult<T> {
  const flagEnabled = flag.enabled !== false

  // 1. Check overrides
  const overrideVariantKey = overrides.get(flag.key)
  if (overrideVariantKey !== undefined) {
    const value = getVariantValue(flag, overrideVariantKey) as T
    return {
      flagKey: flag.key,
      variantKey: overrideVariantKey,
      value,
      reason: 'override',
      flagEnabled,
    }
  }

  // 2. If disabled, return default variant
  if (!flagEnabled) {
    const value = getVariantValue(flag, flag.defaultVariant) as T
    return {
      flagKey: flag.key,
      variantKey: flag.defaultVariant,
      value,
      reason: 'disabled',
      flagEnabled: false,
    }
  }

  // 3. Evaluate targeting rules
  for (const rule of flag.rules ?? []) {
    if (evaluateRule(ctx, rule)) {
      const serve = rule.serve as
        | { variant: string }
        | { rollout: Array<{ variant: string; weight: number }> }

      let resolvedVariantKey: string
      if ('variant' in serve) {
        resolvedVariantKey = serve.variant
      } else {
        const bucket = getBucket(ctx.key, flag.key)
        resolvedVariantKey = selectVariantByRollout(serve.rollout, bucket)
      }

      const value = getVariantValue(flag, resolvedVariantKey) as T
      return {
        flagKey: flag.key,
        variantKey: resolvedVariantKey,
        value,
        reason: 'rule_match',
        flagEnabled: true,
      }
    }
  }

  // 4. No rule matched — return default
  const value = getVariantValue(flag, flag.defaultVariant) as T
  return {
    flagKey: flag.key,
    variantKey: flag.defaultVariant,
    value,
    reason: 'default',
    flagEnabled: true,
  }
}
