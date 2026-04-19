import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "./users"

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: varchar("product_id", { length: 255 }).notNull(),
    productName: varchar("product_name", { length: 500 }).notNull(),
    price: integer("price").notNull(),
    // Nullable: indexer inserts partial rows from CartItemAdded events (no image/size/color/url/retailer).
    // Write-through from addItem always provides full data.
    image: varchar("image", { length: 2048 }),
    size: varchar("size", { length: 50 }),
    color: varchar("color", { length: 50 }),
    productUrl: varchar("product_url", { length: 2048 }),
    retailer: varchar("retailer", { length: 255 }),
    txDigest: varchar("tx_digest", { length: 255 }),
    onChainObjectId: varchar("on_chain_object_id", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_cart_items_user_id").on(table.userId),
    // Partial index: same (user, product, size, color) can be re-added after soft deletion
    uniqueIndex("idx_cart_items_user_variant")
      .on(table.userId, table.productId, table.size, table.color)
      .where(sql`${table.deletedAt} IS NULL`),
    // Unique on on_chain_object_id makes indexer inserts idempotent via onConflictDoNothing
    uniqueIndex("idx_cart_items_on_chain_object_id").on(table.onChainObjectId),
    index("idx_cart_items_deleted_at").on(table.deletedAt),
  ]
)

export type CartItem = typeof cartItems.$inferSelect
export type NewCartItem = typeof cartItems.$inferInsert
