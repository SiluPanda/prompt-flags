import { EvaluationContext, RuleCondition, TargetingRule } from './types'

export function getAttributeValue(ctx: EvaluationContext, attribute: string): unknown {
  if (attribute.startsWith('custom.')) {
    const subKey = attribute.slice('custom.'.length)
    return ctx.custom?.[subKey]
  }
  switch (attribute) {
    case 'key': return ctx.key
    case 'plan': return ctx.plan
    case 'region': return ctx.region
    case 'email': return ctx.email
    case 'role': return ctx.role
    default: return undefined
  }
}

export function evaluateCondition(ctx: EvaluationContext, condition: RuleCondition): boolean {
  const attrValue = getAttributeValue(ctx, condition.attribute)
  const { operator, value, values, negate } = condition

  let result: boolean

  switch (operator) {
    case 'equals':
      result = String(attrValue) === String(value)
      break
    case 'notEquals':
      result = String(attrValue) !== String(value)
      break
    case 'in':
      result = (values ?? []).map(String).includes(String(attrValue))
      break
    case 'notIn':
      result = !(values ?? []).map(String).includes(String(attrValue))
      break
    case 'contains':
      result = typeof attrValue === 'string' && attrValue.includes(String(value))
      break
    case 'startsWith':
      result = typeof attrValue === 'string' && attrValue.startsWith(String(value))
      break
    case 'endsWith':
      result = typeof attrValue === 'string' && attrValue.endsWith(String(value))
      break
    case 'greaterThan':
      result = Number(attrValue) > Number(value)
      break
    case 'lessThan':
      result = Number(attrValue) < Number(value)
      break
    case 'greaterThanOrEqual':
      result = Number(attrValue) >= Number(value)
      break
    case 'lessThanOrEqual':
      result = Number(attrValue) <= Number(value)
      break
    case 'matches':
      try {
        result = typeof attrValue === 'string' && new RegExp(String(value)).test(attrValue)
      } catch {
        result = false
      }
      break
    case 'exists':
      result = attrValue !== undefined && attrValue !== null
      break
    case 'notExists':
      result = attrValue === undefined || attrValue === null
      break
    default:
      result = false
  }

  return negate === true ? !result : result
}

export function evaluateRule(ctx: EvaluationContext, rule: TargetingRule): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return true
  return rule.conditions.every((cond) => evaluateCondition(ctx, cond))
}
