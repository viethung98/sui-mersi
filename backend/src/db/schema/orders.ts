import { pgTable, uuid, varchar, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core"
import { users } from "./users"

export const orders = pgTable(
  "orders",
  {
    id:               uuid("id").primaryKey().defaultRandom(),
    userId:           uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type:             varchar("type", { length: 20 }).notNull().default("checkout"),
    crossmintOrderId: varchar("crossmint_order_id", { length: 255 }),
    status:           varchar("status", { length: 50 }).notNull().default("awaiting_approval"),
    amountUsdc:       numeric("amount_usdc"),
    txHash:           varchar("tx_hash", { length: 255 }),
    paymentHash:      varchar("payment_hash", { length: 255 }),
    createdAt:        timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_orders_user_id").on(table.userId),
    uniqueIndex("idx_orders_crossmint_order_id").on(table.crossmintOrderId),
    uniqueIndex("idx_orders_tx_hash").on(table.txHash),
  ]
)

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
