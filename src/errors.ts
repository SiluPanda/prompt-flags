export class FlagError extends Error {
  constructor(msg: string, readonly code: string) {
    super(msg)
    this.name = 'FlagError'
  }
}

export class FlagNotFoundError extends FlagError {
  constructor(readonly flagKey: string) {
    super(`Flag not found: "${flagKey}"`, 'FLAG_NOT_FOUND')
    this.name = 'FlagNotFoundError'
  }
}

export class FlagTypeMismatchError extends FlagError {
  constructor(readonly flagKey: string, expected: string, actual: string) {
    super(`Type mismatch for "${flagKey}": expected ${expected}, got ${actual}`, 'FLAG_TYPE_MISMATCH')
    this.name = 'FlagTypeMismatchError'
  }
}

export class VariantNotFoundError extends FlagError {
  constructor(readonly flagKey: string, variantKey: string) {
    super(`Variant "${variantKey}" not found in flag "${flagKey}"`, 'VARIANT_NOT_FOUND')
    this.name = 'VariantNotFoundError'
  }
}
