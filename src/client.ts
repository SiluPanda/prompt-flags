import {
  FlagClient,
  FlagClientConfig,
  FlagDefinition,
  EvaluationContext,
  EvaluationResult,
  ModelConfig,
} from './types'
import { FlagNotFoundError, FlagTypeMismatchError } from './errors'
import { evaluate } from './evaluate'

export function createClient(config: FlagClientConfig): FlagClient {
  const flagMap = new Map<string, FlagDefinition>()
  const overrides = new Map<string, string>()

  for (const flag of config.config.flags) {
    flagMap.set(flag.key, flag)
  }

  function resolveFlag(key: string): FlagDefinition {
    const flag = flagMap.get(key)
    if (!flag) throw new FlagNotFoundError(key)
    return flag
  }

  function runEvaluate<T>(key: string, ctx: EvaluationContext): EvaluationResult<T> {
    const flag = resolveFlag(key)
    const mergedCtx: EvaluationContext = {
      ...config.defaultContext,
      ...ctx,
      custom: { ...config.defaultContext?.custom, ...ctx.custom },
    }
    const result = evaluate<T>(flag, mergedCtx, overrides)
    config.onEvaluation?.(result)
    return result
  }

  return {
    evaluate<T>(key: string, ctx: EvaluationContext): EvaluationResult<T> {
      try {
        return runEvaluate<T>(key, ctx)
      } catch (err) {
        config.onError?.(err as Error)
        throw err
      }
    },

    getPrompt(key: string, ctx: EvaluationContext): string {
      const flag = resolveFlag(key)
      if (flag.type !== 'prompt') {
        throw new FlagTypeMismatchError(key, 'prompt', flag.type)
      }
      const result = runEvaluate<string>(key, ctx)
      return result.value
    },

    getModel(key: string, ctx: EvaluationContext): ModelConfig {
      const flag = resolveFlag(key)
      if (flag.type !== 'model') {
        throw new FlagTypeMismatchError(key, 'model', flag.type)
      }
      const result = runEvaluate<ModelConfig>(key, ctx)
      return result.value
    },

    getConfig<T>(key: string, ctx: EvaluationContext): T {
      const flag = resolveFlag(key)
      if (flag.type !== 'config') {
        throw new FlagTypeMismatchError(key, 'config', flag.type)
      }
      const result = runEvaluate<T>(key, ctx)
      return result.value
    },

    isEnabled(key: string, ctx: EvaluationContext): boolean {
      const flag = resolveFlag(key)
      if (flag.type !== 'boolean') {
        throw new FlagTypeMismatchError(key, 'boolean', flag.type)
      }
      const result = runEvaluate<boolean>(key, ctx)
      return result.value
    },

    getFlagKeys(): string[] {
      return Array.from(flagMap.keys())
    },

    getFlag(key: string): FlagDefinition | null {
      return flagMap.get(key) ?? null
    },

    overrideForTest(key: string, variantKey: string): void {
      overrides.set(key, variantKey)
    },

    clearOverride(key: string): void {
      overrides.delete(key)
    },

    clearAllOverrides(): void {
      overrides.clear()
    },
  }
}
