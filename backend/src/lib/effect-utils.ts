import { Effect } from "effect"
import type { Context } from "hono"
import { DatabaseError } from "./errors.js"

export function runService<A, E>(eff: Effect.Effect<A, E, never>) {
  return Effect.runPromise(Effect.either(eff))
}

export const toDatabaseError = (cause: unknown): DatabaseError =>
  new DatabaseError({ cause })

export function serviceErrorJson(
  c: Context,
  err: { _tag: string; message?: string },
  status: number,
) {
  return c.json(
    { error: err.message ?? "An error occurred", code: err._tag },
    status as Parameters<Context["json"]>[1],
  ) as never
}

const errorStatusMap: Record<string, number> = {
  CartItemNotFoundError: 404,
  OrderNotFoundError: 404,
  SessionNotFound: 404,
  SessionOwnershipError: 403,
  CartFullError: 400,
  CartInvalidProductError: 400,
  CheckoutNoWalletError: 400,
  CheckoutMissingAddressError: 400,
  CartDuplicateItemError: 409,
  InsufficientFundsError: 422,
  CheckoutOrderCreationError: 502,
  CheckoutPaymentError: 502,
}

export function errorTagToStatus(tag: string): number {
  return errorStatusMap[tag] ?? 500
}
