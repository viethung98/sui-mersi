import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core"
import { orders } from "./orders.js"
import { cartItems } from "./cart-items.js"

export const orderItems = pgTable(
  "order_items",
  {
    id:              uuid("id").primaryKey().defaultRandom(),
    orderId:         uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    cartItemId:      uuid("cart_item_id").references(() => cartItems.id, { onDelete: "set null" }),
    productId:       varchar("product_id", { length: 255 }).notNull(),
    productName:     varchar("product_name", { length: 500 }).notNull(),
    price:           integer("price").notNull(),
    image:           varchar("image", { length: 2048 }),
    size:            varchar("size", { length: 50 }),
    color:           varchar("color", { length: 50 }),
    productUrl:      varchar("product_url", { length: 2048 }),
    retailer:        varchar("retailer", { length: 255 }),
    onChainObjectId: varchar("on_chain_object_id", { length: 255 }),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_order_items_order_id").on(t.orderId)],
)

export type OrderItem = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert
