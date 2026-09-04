/**
 * Environment access. Every secret is read through here so a missing value
 * fails loudly at first use instead of silently degrading to an insecure
 * default in production.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${name}`)
    }
    // Development convenience only. Never reached in production because of the
    // throw above.
    return `dev-insecure-${name}`
  }
  return value
}

export const env = {
  get authSecret() {
    return required('AUTH_SECRET')
  },
  get slBridgeSecret() {
    return required('SL_BRIDGE_SECRET')
  },
  get appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  },
  get slBridgeMaxSkew() {
    return Number(process.env.SL_BRIDGE_MAX_SKEW ?? 120)
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production'
  },
}
