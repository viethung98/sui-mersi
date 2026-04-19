-- Full schema — merged from all previous migrations.
-- Tables are created in FK dependency order.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE "users" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "crossmint_user_id"        varchar(255) NOT NULL,
  "email"                    varchar(320) NOT NULL,
  "wallet_address"           varchar(66),
  "crossmint_wallet_id"      varchar(255),
  "evm_address"              varchar(42),
  "sui_private_key_encrypted" text,
  "wallet_status"            varchar(20) DEFAULT 'none' NOT NULL,
  "onboarding_step"          integer DEFAULT 0 NOT NULL,
  "display_name"             varchar(100),
  "first_name"               varchar(50),
  "last_name"                varchar(50),
  "street"                   varchar(200),
  "apt"                      varchar(50),
  "country"                  varchar(2),
  "city"                     varchar(100),
  "state"                    varchar(100),
  "zip"                      varchar(20),
  "tops_size"                varchar(10),
  "bottoms_size"             varchar(10),
  "footwear_size"            varchar(10),
  "created_at"               timestamp DEFAULT now() NOT NULL,
  "updated_at"               timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "idx_users_crossmint_user_id" ON "users" ("crossmint_user_id");
CREATE INDEX        "idx_users_email"             ON "users" ("email");
CREATE INDEX        "idx_users_wallet_address"    ON "users" ("wallet_address");
CREATE INDEX        "idx_users_evm_address"       ON "users" ("evm_address");

-- ---------------------------------------------------------------------------
-- chat_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE "chat_sessions" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title"      varchar(100),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "idx_chat_sessions_user_id"    ON "chat_sessions" ("user_id");
CREATE INDEX "idx_chat_sessions_updated_at" ON "chat_sessions" ("updated_at");

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
CREATE TABLE "chat_messages" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "msg_id"     varchar(100),
  "role"       varchar(20) NOT NULL,
  "parts"      jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "idx_chat_messages_session_id" ON "chat_messages" ("session_id");

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
CREATE TABLE "orders" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"            uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type"               varchar(20) DEFAULT 'checkout' NOT NULL,
  "crossmint_order_id" varchar(255),
  "status"             varchar(50) DEFAULT 'awaiting_approval' NOT NULL,
  "amount_usdc"        numeric,
  "tx_hash"            varchar(255),
  "created_at"         timestamp DEFAULT now() NOT NULL
);

CREATE INDEX        "idx_orders_user_id"              ON "orders" ("user_id");
CREATE UNIQUE INDEX "idx_orders_crossmint_order_id"   ON "orders" ("crossmint_order_id");
CREATE UNIQUE INDEX "idx_orders_tx_hash"              ON "orders" ("tx_hash");

-- ---------------------------------------------------------------------------
-- cart_items
-- ---------------------------------------------------------------------------
CREATE TABLE "cart_items" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"             uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "product_id"          varchar(255) NOT NULL,
  "product_name"        varchar(500) NOT NULL,
  "price"               integer NOT NULL,
  "image"               varchar(2048),
  "size"                varchar(50),
  "color"               varchar(50),
  "product_url"         varchar(2048),
  "retailer"            varchar(255),
  "tx_digest"           varchar(255),
  "on_chain_object_id"  varchar(255),
  "deleted_at"          timestamptz DEFAULT NULL,
  "created_at"          timestamp DEFAULT now() NOT NULL
);

CREATE INDEX        "idx_cart_items_user_id"            ON "cart_items" ("user_id");
CREATE UNIQUE INDEX "idx_cart_items_user_variant"       ON "cart_items" ("user_id", "product_id", "size", "color") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "idx_cart_items_on_chain_object_id" ON "cart_items" ("on_chain_object_id");
CREATE INDEX        "idx_cart_items_deleted_at"         ON "cart_items" ("deleted_at") WHERE "deleted_at" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
CREATE TABLE "order_items" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id"            uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "cart_item_id"        uuid REFERENCES "cart_items"("id") ON DELETE SET NULL,
  "product_id"          varchar(255) NOT NULL,
  "product_name"        varchar(500) NOT NULL,
  "price"               integer NOT NULL,
  "image"               varchar(2048),
  "size"                varchar(50),
  "color"               varchar(50),
  "product_url"         varchar(2048),
  "retailer"            varchar(255),
  "on_chain_object_id"  varchar(255),
  "created_at"          timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "idx_order_items_order_id" ON "order_items" ("order_id");
