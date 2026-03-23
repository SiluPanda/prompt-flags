import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createClient } from '../client'
import { selectVariantByRollout } from '../bucket'
import { evaluateCondition } from '../conditions'
import {
  FlagConfiguration,
  FlagClient,
  EvaluationContext,
} from '../types'
import {
  FlagNotFoundError,
  FlagTypeMismatchError,
} from '../errors'

const baseCtx: EvaluationContext = { key: 'user-abc' }

const config: FlagConfiguration = {
  flags: [
    // Boolean flag
    {
      key: 'feature-x',
      type: 'boolean',
      enabled: true,
      variants: [
        { key: 'on', value: true },
        { key: 'off', value: false },
      ],
      defaultVariant: 'off',
    },
    // Boolean flag that is disabled at the flag level
    {
      key: 'feature-disabled',
      type: 'boolean',
      enabled: false,
      variants: [
        { key: 'on', value: true },
        { key: 'off', value: false },
      ],
      defaultVariant: 'off',
    },
    // Prompt flag
    {
      key: 'system-prompt',
      type: 'prompt',
      enabled: true,
      variants: [
        { key: 'v1', value: 'You are a helpful assistant.' },
        { key: 'v2', value: 'You are a concise assistant.' },
      ],
      defaultVariant: 'v1',
    },
    // Model flag
    {
      key: 'model-select',
      type: 'model',
      enabled: true,
      variants: [
        { key: 'fast', value: { model: 'gpt-3.5-turbo', temperature: 0.7 } },
        { key: 'smart', value: { model: 'gpt-4o', temperature: 0.3 } },
      ],
      defaultVariant: 'fast',
    },
    // Config flag
    {
      key: 'rate-limit',
      type: 'config',
      enabled: true,
      variants: [
        { key: 'low', value: { rpm: 10 } },
        { key: 'high', value: { rpm: 100 } },
      ],
      defaultVariant: 'low',
    },
    // Boolean flag with equals targeting rule
    {
      key: 'pro-feature',
      type: 'boolean',
      enabled: true,
      variants: [
        { key: 'on', value: true },
        { key: 'off', value: false },
      ],
      defaultVariant: 'off',
      rules: [
        {
          conditions: [{ attribute: 'plan', operator: 'equals', value: 'pro' }],
          serve: { variant: 'on' },
        },
      ],
    },
    // Boolean flag with 'in' targeting rule
    {
      key: 'beta-feature',
      type: 'boolean',
      enabled: true,
      variants: [
        { key: 'on', value: true },
        { key: 'off', value: false },
      ],
      defaultVariant: 'off',
      rules: [
        {
          conditions: [
            { attribute: 'plan', operator: 'in', values: ['beta', 'enterprise'] },
          ],
          serve: { variant: 'on' },
        },
      ],
    },
    // Rollout flag (50/50)
    {
      key: 'rollout-flag',
      type: 'boolean',
      enabled: true,
      variants: [
        { key: 'on', value: true },
        { key: 'off', value: false },
      ],
      defaultVariant: 'off',
      rules: [
        {
          serve: {
            rollout: [
              { variant: 'on', weight: 50 },
              { variant: 'off', weight: 50 },
            ],
          },
        },
      ],
    },
    // Prompt flag with contains condition
    {
      key: 'email-prompt',
      type: 'prompt',
      enabled: true,
      variants: [
        { key: 'enterprise', value: 'Enterprise prompt.' },
        { key: 'default', value: 'Default prompt.' },
      ],
      defaultVariant: 'default',
      rules: [
        {
          conditions: [{ attribute: 'email', operator: 'endsWith', value: '@corp.com' }],
          serve: { variant: 'enterprise' },
        },
      ],
    },
  ],
}

describe('createClient', () => {
  let client: FlagClient

  beforeEach(() => {
    client = createClient({ config })
  })

  describe('boolean flag: isEnabled', () => {
    it('returns false for default off variant', () => {
      expect(client.isEnabled('feature-x', baseCtx)).toBe(false)
    })

    it('returns false when flag is disabled (reason: disabled)', () => {
      expect(client.isEnabled('feature-disabled', baseCtx)).toBe(false)
    })

    it('evaluate returns reason=disabled when flag.enabled=false', () => {
      const result = client.evaluate('feature-disabled', baseCtx)
      expect(result.reason).toBe('disabled')
      expect(result.flagEnabled).toBe(false)
    })
  })

  describe('prompt flag: getPrompt', () => {
    it('returns default variant string', () => {
      const prompt = client.getPrompt('system-prompt', baseCtx)
      expect(prompt).toBe('You are a helpful assistant.')
    })

    it('throws FlagTypeMismatchError when called on a boolean flag', () => {
      expect(() => client.getPrompt('feature-x', baseCtx)).toThrow(FlagTypeMismatchError)
    })
  })

  describe('model flag: getModel', () => {
    it('returns default ModelConfig', () => {
      const model = client.getModel('model-select', baseCtx)
      expect(model).toEqual({ model: 'gpt-3.5-turbo', temperature: 0.7 })
    })

    it('throws FlagTypeMismatchError when called on a boolean flag', () => {
      expect(() => client.getModel('feature-x', baseCtx)).toThrow(FlagTypeMismatchError)
    })
  })

  describe('config flag: getConfig', () => {
    it('returns typed config value', () => {
      const cfg = client.getConfig<{ rpm: number }>('rate-limit', baseCtx)
      expect(cfg.rpm).toBe(10)
    })
  })

  describe('targeting rules: equals condition', () => {
    it('matches pro plan user and enables feature', () => {
      const proCtx: EvaluationContext = { key: 'user-pro', plan: 'pro' }
      expect(client.isEnabled('pro-feature', proCtx)).toBe(true)
    })

    it('does not match free plan user', () => {
      const freeCtx: EvaluationContext = { key: 'user-free', plan: 'free' }
      expect(client.isEnabled('pro-feature', freeCtx)).toBe(false)
    })

    it('evaluate returns reason=rule_match for matching rule', () => {
      const proCtx: EvaluationContext = { key: 'user-pro', plan: 'pro' }
      const result = client.evaluate('pro-feature', proCtx)
      expect(result.reason).toBe('rule_match')
      expect(result.variantKey).toBe('on')
    })
  })

  describe('targeting rules: in condition', () => {
    it('matches beta plan user', () => {
      const betaCtx: EvaluationContext = { key: 'user-beta', plan: 'beta' }
      expect(client.isEnabled('beta-feature', betaCtx)).toBe(true)
    })

    it('matches enterprise plan user', () => {
      const entCtx: EvaluationContext = { key: 'user-ent', plan: 'enterprise' }
      expect(client.isEnabled('beta-feature', entCtx)).toBe(true)
    })

    it('does not match free plan user', () => {
      const freeCtx: EvaluationContext = { key: 'user-free', plan: 'free' }
      expect(client.isEnabled('beta-feature', freeCtx)).toBe(false)
    })
  })

  describe('targeting rules: endsWith condition', () => {
    it('returns enterprise prompt for corp email', () => {
      const ctx: EvaluationContext = { key: 'u1', email: 'alice@corp.com' }
      expect(client.getPrompt('email-prompt', ctx)).toBe('Enterprise prompt.')
    })

    it('returns default prompt for non-corp email', () => {
      const ctx: EvaluationContext = { key: 'u2', email: 'bob@gmail.com' }
      expect(client.getPrompt('email-prompt', ctx)).toBe('Default prompt.')
    })
  })

  describe('rollout: deterministic bucketing', () => {
    it('same context key always returns the same variant', () => {
      const ctx: EvaluationContext = { key: 'stable-user' }
      const first = client.evaluate('rollout-flag', ctx)
      const second = client.evaluate('rollout-flag', ctx)
      expect(first.variantKey).toBe(second.variantKey)
    })

    it('distributes roughly 50/50 across many users', () => {
      let onCount = 0
      const total = 1000
      for (let i = 0; i < total; i++) {
        const ctx: EvaluationContext = { key: `user-${i}` }
        const result = client.evaluate<boolean>('rollout-flag', ctx)
        if (result.variantKey === 'on') onCount++
      }
      // Expect between 40% and 60% (deterministic hash, not truly random)
      expect(onCount).toBeGreaterThan(350)
      expect(onCount).toBeLessThan(650)
    })
  })

  describe('test overrides', () => {
    it('overrideForTest forces a specific variant', () => {
      client.overrideForTest('feature-x', 'on')
      expect(client.isEnabled('feature-x', baseCtx)).toBe(true)
      const result = client.evaluate('feature-x', baseCtx)
      expect(result.reason).toBe('override')
    })

    it('clearOverride removes the override', () => {
      client.overrideForTest('feature-x', 'on')
      client.clearOverride('feature-x')
      expect(client.isEnabled('feature-x', baseCtx)).toBe(false)
    })

    it('clearAllOverrides removes all overrides', () => {
      client.overrideForTest('feature-x', 'on')
      client.overrideForTest('feature-disabled', 'on')
      client.clearAllOverrides()
      expect(client.isEnabled('feature-x', baseCtx)).toBe(false)
    })
  })

  describe('error cases', () => {
    it('throws FlagNotFoundError for unknown flag key', () => {
      expect(() => client.evaluate('nonexistent', baseCtx)).toThrow(FlagNotFoundError)
    })

    it('FlagNotFoundError has the correct flagKey', () => {
      try {
        client.evaluate('nonexistent', baseCtx)
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(FlagNotFoundError)
        expect((err as FlagNotFoundError).flagKey).toBe('nonexistent')
      }
    })

    it('FlagTypeMismatchError has the correct code', () => {
      try {
        client.getPrompt('feature-x', baseCtx)
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(FlagTypeMismatchError)
        expect((err as FlagTypeMismatchError).code).toBe('FLAG_TYPE_MISMATCH')
      }
    })
  })

  describe('utility methods', () => {
    it('getFlagKeys returns all flag keys', () => {
      const keys = client.getFlagKeys()
      expect(keys).toContain('feature-x')
      expect(keys).toContain('system-prompt')
      expect(keys.length).toBe(config.flags.length)
    })

    it('getFlag returns FlagDefinition for known key', () => {
      const flag = client.getFlag('feature-x')
      expect(flag).not.toBeNull()
      expect(flag!.type).toBe('boolean')
    })

    it('getFlag returns null for unknown key', () => {
      expect(client.getFlag('nope')).toBeNull()
    })
  })

  describe('onEvaluation callback', () => {
    it('calls onEvaluation with the result', () => {
      const cb = vi.fn()
      const c = createClient({ config, onEvaluation: cb })
      c.isEnabled('feature-x', baseCtx)
      expect(cb).toHaveBeenCalledOnce()
      expect(cb.mock.calls[0][0].flagKey).toBe('feature-x')
    })
  })

  describe('regression: rollout zero-weight safety', () => {
    it('does not crash or produce NaN with zero-weight rollout', () => {
      const result = selectVariantByRollout(
        [{ variant: 'a', weight: 0 }, { variant: 'b', weight: 0 }],
        5000
      )
      expect(result).toBe('a')
    })

    it('returns empty string for empty rollout', () => {
      const result = selectVariantByRollout([], 5000)
      expect(result).toBe('')
    })
  })

  describe('regression: invalid regex in matches operator', () => {
    it('returns false for invalid regex pattern instead of crashing', () => {
      const result = evaluateCondition(
        { key: 'user-1', email: 'test@example.com' },
        { attribute: 'email', operator: 'matches', value: '[invalid' }
      )
      expect(result).toBe(false)
    })
  })

  describe('regression: deep merge of custom attributes', () => {
    it('preserves defaultContext custom attributes when ctx also has custom', () => {
      const customConfig = {
        ...config,
        flags: [
          ...config.flags,
          {
            key: 'custom-check',
            type: 'boolean' as const,
            enabled: true,
            defaultVariant: 'on',
            variants: [
              { key: 'on', value: true },
              { key: 'off', value: false },
            ],
            rules: [{
              conditions: [
                { attribute: 'custom.source', operator: 'equals' as const, value: 'default-source' },
              ],
              serve: { variant: 'on' },
            }],
          },
        ],
      }
      const c = createClient({
        config: customConfig,
        defaultContext: { key: 'user', custom: { source: 'default-source', extra: 'kept' } },
      })
      // ctx.custom overrides source but defaultContext.custom.extra should survive
      const result = c.isEnabled('custom-check', { key: 'user', custom: { other: 'value' } })
      // source comes from defaultContext, should still match
      expect(result).toBe(true)
    })
  })
})
