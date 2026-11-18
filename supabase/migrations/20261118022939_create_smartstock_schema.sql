CREATE TYPE public.stock_movement_type AS ENUM (
    'opening_balance',
    'sale',
    'adjustment'
);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_auth_user_fkey
        FOREIGN KEY (id)
        REFERENCES auth.users (id)
        ON DELETE CASCADE,
    CONSTRAINT profiles_display_name_check
        CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 255)
);

CREATE TABLE public.categories (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT categories_pkey PRIMARY KEY (id),
    CONSTRAINT categories_name_check
        CHECK (char_length(btrim(name)) BETWEEN 1 AND 255)
);

CREATE UNIQUE INDEX categories_name_normalized_uidx
    ON public.categories (lower(btrim(name)));

CREATE TABLE public.products (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    category_id uuid NOT NULL,
    price numeric(12, 2) NOT NULL,
    stock bigint NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_pkey PRIMARY KEY (id),
    CONSTRAINT products_category_fkey
        FOREIGN KEY (category_id)
        REFERENCES public.categories (id)
        ON DELETE RESTRICT,
    CONSTRAINT products_name_check
        CHECK (char_length(btrim(name)) BETWEEN 1 AND 255),
    CONSTRAINT products_price_check
        CHECK (price >= 0),
    CONSTRAINT products_stock_check
        CHECK (stock >= 0)
);

CREATE INDEX products_category_id_idx
    ON public.products (category_id);

CREATE TABLE public.transactions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    receipt_number bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    created_by uuid NOT NULL,
    total numeric(12, 2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT transactions_pkey PRIMARY KEY (id),
    CONSTRAINT transactions_receipt_number_key UNIQUE (receipt_number),
    CONSTRAINT transactions_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES public.profiles (id)
        ON DELETE RESTRICT,
    CONSTRAINT transactions_receipt_number_check
        CHECK (receipt_number > 0),
    CONSTRAINT transactions_total_check
        CHECK (total >= 0)
);

CREATE INDEX transactions_created_at_idx
    ON public.transactions (created_at DESC);

CREATE INDEX transactions_created_by_created_at_idx
    ON public.transactions (created_by, created_at DESC);

CREATE TABLE public.transaction_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name_snapshot text NOT NULL,
    quantity bigint NOT NULL,
    unit_price numeric(12, 2) NOT NULL,
    subtotal numeric(12, 2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT transaction_items_pkey PRIMARY KEY (id),
    CONSTRAINT transaction_items_transaction_fkey
        FOREIGN KEY (transaction_id)
        REFERENCES public.transactions (id)
        ON DELETE RESTRICT,
    CONSTRAINT transaction_items_product_fkey
        FOREIGN KEY (product_id)
        REFERENCES public.products (id)
        ON DELETE RESTRICT,
    CONSTRAINT transaction_items_transaction_product_key
        UNIQUE (transaction_id, product_id),
    CONSTRAINT transaction_items_product_name_snapshot_check
        CHECK (btrim(product_name_snapshot) <> ''),
    CONSTRAINT transaction_items_quantity_check
        CHECK (quantity > 0),
    CONSTRAINT transaction_items_unit_price_check
        CHECK (unit_price >= 0),
    CONSTRAINT transaction_items_subtotal_check
        CHECK (subtotal >= 0),
    CONSTRAINT transaction_items_subtotal_matches_check
        CHECK (subtotal = unit_price * quantity::numeric)
);

CREATE INDEX transaction_items_product_id_idx
    ON public.transaction_items (product_id);

CREATE TABLE public.stock_movements (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    transaction_item_id uuid,
    movement_type public.stock_movement_type NOT NULL,
    quantity_change bigint NOT NULL,
    stock_before bigint NOT NULL,
    stock_after bigint NOT NULL,
    reason text,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
    CONSTRAINT stock_movements_product_fkey
        FOREIGN KEY (product_id)
        REFERENCES public.products (id)
        ON DELETE RESTRICT,
    CONSTRAINT stock_movements_transaction_item_fkey
        FOREIGN KEY (transaction_item_id)
        REFERENCES public.transaction_items (id)
        ON DELETE RESTRICT,
    CONSTRAINT stock_movements_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES public.profiles (id)
        ON DELETE RESTRICT,
    CONSTRAINT stock_movements_stock_before_check
        CHECK (stock_before >= 0),
    CONSTRAINT stock_movements_stock_after_check
        CHECK (stock_after >= 0),
    CONSTRAINT stock_movements_stock_math_check
        CHECK (
            stock_after::numeric =
            stock_before::numeric + quantity_change::numeric
        ),
    CONSTRAINT stock_movements_type_rules_check
        CHECK (
            (
                movement_type = 'sale'
                AND transaction_item_id IS NOT NULL
                AND quantity_change < 0
            )
            OR (
                movement_type = 'opening_balance'
                AND transaction_item_id IS NULL
                AND stock_before = 0
                AND quantity_change > 0
            )
            OR (
                movement_type = 'adjustment'
                AND transaction_item_id IS NULL
                AND quantity_change <> 0
                AND reason IS NOT NULL
                AND btrim(reason) <> ''
            )
        )
);

CREATE UNIQUE INDEX stock_movements_transaction_item_uidx
    ON public.stock_movements (transaction_item_id)
    WHERE transaction_item_id IS NOT NULL;

CREATE INDEX stock_movements_product_created_at_idx
    ON public.stock_movements (product_id, created_at DESC);

CREATE INDEX stock_movements_created_by_created_at_idx
    ON public.stock_movements (created_by, created_at DESC);
