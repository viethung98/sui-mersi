-- Upgrade cart_items from the original DB-backed cart schema to the
-- soft-delete/on-chain-sync schema used by the current services.

ALTER TABLE "cart_items"
  ADD COLUMN IF NOT EXISTS "tx_digest" varchar(255),
  ADD COLUMN IF NOT EXISTS "on_chain_object_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz DEFAULT NULL;

ALTER TABLE "cart_items"
  ALTER COLUMN "image" DROP NOT NULL,
  ALTER COLUMN "size" DROP NOT NULL,
  ALTER COLUMN "color" DROP NOT NULL,
  ALTER COLUMN "product_url" DROP NOT NULL,
  ALTER COLUMN "retailer" DROP NOT NULL;

DROP INDEX IF EXISTS "idx_cart_items_user_variant";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_cart_items_user_variant"
  ON "cart_items" ("user_id", "product_id", "size", "color")
  WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_cart_items_on_chain_object_id"
  ON "cart_items" ("on_chain_object_id");

CREATE INDEX IF NOT EXISTS "idx_cart_items_deleted_at"
  ON "cart_items" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
