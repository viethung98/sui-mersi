import { createCrossmint, CrossmintAuth } from "@crossmint/server-sdk"
import { env } from "./env.js"

let _crossmintAuth: CrossmintAuth | undefined

function getRealAuth(): CrossmintAuth {
  if (!_crossmintAuth) {
    const crossmint = createCrossmint({ apiKey: env.CROSSMINT_SERVER_API_KEY })
    _crossmintAuth = CrossmintAuth.from(crossmint)
  }
  return _crossmintAuth
}

// Defers SDK init to first use — safe for test environments with fake API keys.
// Property assignments on the exported object (e.g. crossmintAuth.getSession = mock)
// take priority over real SDK methods, enabling per-method test overrides without
// ever constructing the real CrossmintAuth client.
const _overrides: Record<string | symbol, unknown> = {}

export const crossmintAuth = new Proxy({} as CrossmintAuth, {
  get(_target, prop) {
    if (Object.prototype.hasOwnProperty.call(_overrides, prop)) {
      return _overrides[prop]
    }
    return (getRealAuth() as unknown as Record<string | symbol, unknown>)[prop]
  },
  set(_target, prop, value) {
    _overrides[prop] = value
    return true
  },
})
