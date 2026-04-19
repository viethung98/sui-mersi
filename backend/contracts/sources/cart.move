/// Cart module — manages on-chain shopping carts for custodial users.
///
/// Architecture:
/// - Each user has one Cart shared object (created by the backend relayer on first interaction).
/// - The relayer signs all transactions on behalf of the user (custodial model).
/// - Cart items are stored as a vector inside the Cart.
/// - Events are emitted for all mutations so the indexer can reconstruct state in the DB.
/// - item_id is a UUID string supplied by the backend before submitting the PTB.
module cart::cart {
    use std::string::String;
    use sui::event;
    use sui::object_table::{Self, ObjectTable};

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    const EItemNotFound: u64 = 1;
    const ECartAlreadyExists: u64 = 2;
    const ECartFull: u64 = 3;
    const ENotAuthorized: u64 = 4;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// Mirrors the backend MAX_CART_ITEMS limit so it cannot be bypassed
    /// by submitting PTBs directly to the Sui network.
    const MAX_CART_ITEMS: u64 = 10;

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    /// Global registry mapping owner address → Cart object ID.
    /// Shared so the backend relayer can always find a user's cart.
    public struct CartRegistry has key {
        id: UID,
        admin: address,
        carts: ObjectTable<address, Cart>,
    }

    /// A user's shopping cart. Stored inside the registry.
    public struct Cart has key, store {
        id: UID,
        owner: address,
        items: vector<CartItem>,
    }

    /// A single item inside a Cart.
    public struct CartItem has store, drop, copy {
        /// UUID string assigned by the backend before submitting the PTB.
        item_id: String,
        product_id: String,
        product_name: String,
        /// Price in cents (e.g., 14999 = $149.99)
        price: u64,
        image: String,
        size: String,
        color: String,
        product_url: String,
        retailer: String,
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    public struct CartCreated has copy, drop {
        owner: address,
    }

    public struct CartItemAdded has copy, drop {
        owner: address,
        item_id: String,
        product_id: String,
        product_name: String,
        price: u64,
        image: String,
        size: String,
        color: String,
        product_url: String,
        retailer: String,
    }

    public struct CartItemRemoved has copy, drop {
        owner: address,
        item_id: String,
        product_id: String,
        product_name: String,
        price: u64,
        image: String,
        size: String,
        color: String,
        product_url: String,
        retailer: String,
    }

    /// Emitted when a single item is checked out. The backend processes one
    /// Crossmint order per item, so checkout removes exactly one item and
    /// emits one event. The indexer deletes only that item from the DB cache.
    public struct OrderCreated has copy, drop {
        owner: address,
        /// Backend-assigned order ID (UUID string)
        order_id: String,
        /// Backend-assigned item ID (UUID string)
        item_id: String,
        product_id: String,
        product_name: String,
        price: u64,
        image: String,
        size: String,
        color: String,
        product_url: String,
        retailer: String,
    }

    // -------------------------------------------------------------------------
    // Initializer — creates the shared registry once at deploy time
    // -------------------------------------------------------------------------

    fun init(ctx: &mut TxContext) {
        let registry = CartRegistry {
            id: object::new(ctx),
            admin: ctx.sender(),
            carts: object_table::new(ctx),
        };
        transfer::share_object(registry);
    }

    /// Transfer admin rights to a new address. Only the current admin can call this.
    public fun set_admin(registry: &mut CartRegistry, new_admin: address, ctx: &TxContext) {
        assert!(ctx.sender() == registry.admin, ENotAuthorized);
        registry.admin = new_admin;
    }

    // -------------------------------------------------------------------------
    // Public entry functions
    // -------------------------------------------------------------------------

    /// Create a cart for `owner`. Only callable once per owner.
    public fun create_cart(
        registry: &mut CartRegistry,
        owner: address,
        ctx: &mut TxContext,
    ) {
        assert!(!object_table::contains(&registry.carts, owner), ECartAlreadyExists);

        let cart = Cart {
            id: object::new(ctx),
            owner,
            items: vector::empty(),
        };

        object_table::add(&mut registry.carts, owner, cart);
        event::emit(CartCreated { owner });
    }

    /// Add an item to the user's cart. Aborts with ECartFull if already at MAX_CART_ITEMS.
    /// `item_id` is a UUID string generated by the backend before submitting this PTB.
    public fun add_item(
        registry: &mut CartRegistry,
        owner: address,
        item_id: String,
        product_id: String,
        product_name: String,
        price: u64,
        image: String,
        size: String,
        color: String,
        product_url: String,
        retailer: String,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == owner || ctx.sender() == registry.admin, ENotAuthorized);

        let cart = object_table::borrow_mut(&mut registry.carts, owner);

        assert!(vector::length(&cart.items) < MAX_CART_ITEMS, ECartFull);

        let item = CartItem {
            item_id,
            product_id,
            product_name,
            price,
            image,
            size,
            color,
            product_url,
            retailer,
        };

        vector::push_back(&mut cart.items, item);

        event::emit(CartItemAdded {
            owner,
            item_id: item.item_id,
            product_id: item.product_id,
            product_name: item.product_name,
            price,
            image: item.image,
            size: item.size,
            color: item.color,
            product_url: item.product_url,
            retailer: item.retailer,
        });
    }

    /// Remove an item from the cart by its UUID item_id.
    public fun remove_item(
        registry: &mut CartRegistry,
        owner: address,
        item_id: String,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == owner || ctx.sender() == registry.admin, ENotAuthorized);

        let cart = object_table::borrow_mut(&mut registry.carts, owner);
        let len = vector::length(&cart.items);
        let mut i = 0;
        let mut found = false;
        let mut removed_product_id = std::string::utf8(b"");
        let mut removed_product_name = std::string::utf8(b"");
        let mut removed_price: u64 = 0;
        let mut removed_image = std::string::utf8(b"");
        let mut removed_size = std::string::utf8(b"");
        let mut removed_color = std::string::utf8(b"");
        let mut removed_product_url = std::string::utf8(b"");
        let mut removed_retailer = std::string::utf8(b"");

        while (i < len) {
            let item = vector::borrow(&cart.items, i);
            if (item.item_id == item_id) {
                removed_product_id = item.product_id;
                removed_product_name = item.product_name;
                removed_price = item.price;
                removed_image = item.image;
                removed_size = item.size;
                removed_color = item.color;
                removed_product_url = item.product_url;
                removed_retailer = item.retailer;
                vector::remove(&mut cart.items, i);
                found = true;
                break
            };
            i = i + 1;
        };

        assert!(found, EItemNotFound);

        event::emit(CartItemRemoved {
            owner,
            item_id,
            product_id: removed_product_id,
            product_name: removed_product_name,
            price: removed_price,
            image: removed_image,
            size: removed_size,
            color: removed_color,
            product_url: removed_product_url,
            retailer: removed_retailer,
        });
    }

    /// Checkout a single cart item by UUID item_id. Removes only that item from the cart
    /// and emits OrderCreated so the indexer can delete it from the DB cache.
    /// The backend creates one Crossmint order per item, so this must be called
    /// once per item being purchased — not once for the whole cart.
    public fun checkout(
        registry: &mut CartRegistry,
        owner: address,
        order_id: String,
        item_id: String,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == owner || ctx.sender() == registry.admin, ENotAuthorized);

        let cart = object_table::borrow_mut(&mut registry.carts, owner);
        let len = vector::length(&cart.items);
        let mut i = 0;
        let mut found = false;
        let mut checked_out_product_id = std::string::utf8(b"");
        let mut checked_out_product_name = std::string::utf8(b"");
        let mut checked_out_price: u64 = 0;
        let mut checked_out_image = std::string::utf8(b"");
        let mut checked_out_size = std::string::utf8(b"");
        let mut checked_out_color = std::string::utf8(b"");
        let mut checked_out_product_url = std::string::utf8(b"");
        let mut checked_out_retailer = std::string::utf8(b"");

        while (i < len) {
            let item = vector::borrow(&cart.items, i);
            if (item.item_id == item_id) {
                checked_out_product_id = item.product_id;
                checked_out_product_name = item.product_name;
                checked_out_price = item.price;
                checked_out_image = item.image;
                checked_out_size = item.size;
                checked_out_color = item.color;
                checked_out_product_url = item.product_url;
                checked_out_retailer = item.retailer;
                vector::remove(&mut cart.items, i);
                found = true;
                break
            };
            i = i + 1;
        };

        assert!(found, EItemNotFound);

        event::emit(OrderCreated {
            owner,
            order_id,
            item_id,
            product_id: checked_out_product_id,
            product_name: checked_out_product_name,
            price: checked_out_price,
            image: checked_out_image,
            size: checked_out_size,
            color: checked_out_color,
            product_url: checked_out_product_url,
            retailer: checked_out_retailer,
        });
    }

    // -------------------------------------------------------------------------
    // View functions (read-only, no gas cost when called off-chain)
    // -------------------------------------------------------------------------

    /// Returns the caller's cart items. Sender is derived from tx context — no address spoofing possible.
    public fun get_cart(registry: &CartRegistry, ctx: &TxContext): vector<CartItem> {
        let owner = ctx.sender();
        if (!object_table::contains(&registry.carts, owner)) {
            return vector::empty()
        };
        *&object_table::borrow(&registry.carts, owner).items
    }

    /// Returns item count for the caller's cart.
    public fun get_cart_item_count(registry: &CartRegistry, ctx: &TxContext): u64 {
        let owner = ctx.sender();
        if (!object_table::contains(&registry.carts, owner)) {
            return 0
        };
        vector::length(&object_table::borrow(&registry.carts, owner).items)
    }

    /// Returns the on-chain object address of the caller's Cart.
    /// Returns @0x0 if the cart has not been created yet.
    public fun get_cart_address(registry: &CartRegistry, ctx: &TxContext): address {
        let owner = ctx.sender();
        if (!object_table::contains(&registry.carts, owner)) {
            return @0x0
        };
        object::uid_to_address(&object_table::borrow(&registry.carts, owner).id)
    }

    public fun get_items(registry: &CartRegistry, owner: address): vector<CartItem> {
        if (!object_table::contains(&registry.carts, owner)) {
            return vector::empty()
        };
        *&object_table::borrow(&registry.carts, owner).items
    }

    public fun item_count(registry: &CartRegistry, owner: address): u64 {
        if (!object_table::contains(&registry.carts, owner)) {
            return 0
        };
        vector::length(&object_table::borrow(&registry.carts, owner).items)
    }
}
