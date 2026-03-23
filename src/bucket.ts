import murmur from 'murmurhash3js'

export function getBucket(contextKey: string, flagKey: string): number {
  const hash = murmur.x86.hash32(`${contextKey}:${flagKey}`, 0)
  return Math.abs(hash) % 10000
}

export function selectVariantByRollout(
  rollout: Array<{ variant: string; weight: number }>,
  bucket: number
): string {
  if (rollout.length === 0) return ''
  const total = rollout.reduce((s, r) => s + r.weight, 0)
  if (total <= 0) return rollout[0].variant
  let cumulative = 0
  for (const r of rollout) {
    cumulative += (r.weight / total) * 10000
    if (bucket < cumulative) return r.variant
  }
  return rollout[rollout.length - 1].variant
}
