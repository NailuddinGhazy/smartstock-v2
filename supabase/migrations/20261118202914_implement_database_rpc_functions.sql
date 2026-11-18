CREATE FUNCTION public.create_product(
    p_name text,
    p_category_id uuid,
    p_price numeric,
    p_initial_stock bigint DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_product_id uuid;
    v_user_id uuid;
    v_clean_name text;
    v_category_is_active boolean;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL
       OR internal.current_profile_is_active() IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'An active profile is required'
            USING ERRCODE = '42501';
    END IF;

    IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Product name must not be empty'
            USING ERRCODE = '22023';
    END IF;

    v_clean_name := pg_catalog.btrim(p_name);
    IF pg_catalog.char_length(v_clean_name) > 255 THEN
        RAISE EXCEPTION 'Product name must not exceed 255 characters'
            USING ERRCODE = '22023';
    END IF;

    IF p_category_id IS NULL THEN
        RAISE EXCEPTION 'A category is required'
            USING ERRCODE = '22023';
    END IF;

    SELECT c.is_active
    INTO v_category_is_active
    FROM public.categories AS c
    WHERE c.id = p_category_id
    FOR SHARE;

    IF NOT FOUND OR v_category_is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Product category must exist and be active'
            USING ERRCODE = '23514';
    END IF;

    IF p_price IS NULL
       OR p_price < 0
       OR p_price > 9999999999.99::numeric
       OR p_price <> pg_catalog.trunc(p_price, 2) THEN
        RAISE EXCEPTION 'Price must fit numeric(12,2) without rounding'
            USING ERRCODE = '22023';
    END IF;

    IF p_initial_stock IS NULL OR p_initial_stock < 0 THEN
        RAISE EXCEPTION 'Initial stock must be a non-negative bigint'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.products (
        name,
        category_id,
        price,
        stock
    )
    VALUES (
        v_clean_name,
        p_category_id,
        p_price,
        p_initial_stock
    )
    RETURNING id INTO v_product_id;

    IF p_initial_stock > 0 THEN
        INSERT INTO public.stock_movements (
            product_id,
            transaction_item_id,
            movement_type,
            quantity_change,
            stock_before,
            stock_after,
            created_by
        )
        VALUES (
            v_product_id,
            NULL,
            'opening_balance'::public.stock_movement_type,
            p_initial_stock,
            0,
            p_initial_stock,
            auth.uid()
        );
    END IF;

    RETURN v_product_id;
END;
$function$;

CREATE FUNCTION public.adjust_stock(
    p_product_id uuid,
    p_delta bigint,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_clean_reason text;
    v_stock_before bigint;
    v_stock_after_numeric numeric;
    v_stock_after bigint;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL
       OR internal.current_profile_is_active() IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'An active profile is required'
            USING ERRCODE = '42501';
    END IF;

    IF p_product_id IS NULL THEN
        RAISE EXCEPTION 'A product is required'
            USING ERRCODE = '22023';
    END IF;

    IF p_delta IS NULL OR p_delta = 0 THEN
        RAISE EXCEPTION 'Stock adjustment delta must be non-zero'
            USING ERRCODE = '22023';
    END IF;

    IF p_reason IS NULL OR pg_catalog.btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'Stock adjustment reason must not be empty'
            USING ERRCODE = '22023';
    END IF;

    v_clean_reason := pg_catalog.btrim(p_reason);

    SELECT p.stock
    INTO v_stock_before
    FROM public.products AS p
    WHERE p.id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product does not exist'
            USING ERRCODE = '22023';
    END IF;

    v_stock_after_numeric :=
        v_stock_before::numeric + p_delta::numeric;

    IF v_stock_after_numeric < 0
       OR v_stock_after_numeric > 9223372036854775807::numeric THEN
        RAISE EXCEPTION 'Adjusted stock is outside the bigint range'
            USING ERRCODE = '22003';
    END IF;

    v_stock_after := v_stock_after_numeric::bigint;

    UPDATE public.products AS p
    SET stock = v_stock_after
    WHERE p.id = p_product_id;

    INSERT INTO public.stock_movements (
        product_id,
        transaction_item_id,
        movement_type,
        quantity_change,
        stock_before,
        stock_after,
        reason,
        created_by
    )
    VALUES (
        p_product_id,
        NULL,
        'adjustment'::public.stock_movement_type,
        p_delta,
        v_stock_before,
        v_stock_after,
        v_clean_reason,
        auth.uid()
    );

    RETURN;
END;
$function$;

CREATE FUNCTION public.create_sale(
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_item jsonb;
    v_product_id uuid;
    v_quantity_numeric numeric;
    v_quantity bigint;
    v_product_ids uuid[] := ARRAY[]::uuid[];
    v_quantities bigint[] := ARRAY[]::bigint[];
    v_locked_product_id uuid;
    v_item_count integer;
    v_index integer;
    v_product_name text;
    v_product_price numeric;
    v_product_stock bigint;
    v_product_is_active boolean;
    v_stock_after bigint;
    v_subtotal numeric;
    v_total numeric := 0;
    v_product_names text[] := ARRAY[]::text[];
    v_unit_prices numeric[] := ARRAY[]::numeric[];
    v_stock_befores bigint[] := ARRAY[]::bigint[];
    v_stock_afters bigint[] := ARRAY[]::bigint[];
    v_subtotals numeric[] := ARRAY[]::numeric[];
    v_transaction_id uuid;
    v_transaction_item_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL
       OR internal.current_profile_is_active() IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'An active profile is required'
            USING ERRCODE = '42501';
    END IF;

    IF p_items IS NULL
       OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Sale items must be a JSON array'
            USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'A sale must contain at least one item'
            USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_array_length(p_items) > 100 THEN
        RAISE EXCEPTION 'A sale cannot contain more than 100 products'
            USING ERRCODE = '22023';
    END IF;

    FOR v_item IN
        SELECT item.value
        FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
    LOOP
        IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Each sale item must be a JSON object'
                USING ERRCODE = '22023';
        END IF;

        IF NOT (v_item ? 'product_id')
           OR NOT (v_item ? 'quantity')
           OR (v_item - 'product_id' - 'quantity') <> '{}'::jsonb THEN
            RAISE EXCEPTION 'Each sale item must contain only product_id and quantity'
                USING ERRCODE = '22023';
        END IF;

        IF pg_catalog.jsonb_typeof(v_item -> 'product_id')
           IS DISTINCT FROM 'string' THEN
            RAISE EXCEPTION 'Each product_id must be a UUID string'
                USING ERRCODE = '22023';
        END IF;

        BEGIN
            v_product_id := (v_item ->> 'product_id')::uuid;
        EXCEPTION
            WHEN invalid_text_representation THEN
                RAISE EXCEPTION 'Each product_id must be a valid UUID'
                    USING ERRCODE = '22023';
        END;

        IF pg_catalog.jsonb_typeof(v_item -> 'quantity')
           IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Each quantity must be a positive integer'
                USING ERRCODE = '22023';
        END IF;

        v_quantity_numeric := (v_item ->> 'quantity')::numeric;
        IF v_quantity_numeric < 1
           OR v_quantity_numeric <> pg_catalog.trunc(v_quantity_numeric)
           OR v_quantity_numeric > 9223372036854775807::numeric THEN
            RAISE EXCEPTION 'Each quantity must be a positive bigint'
                USING ERRCODE = '22023';
        END IF;

        v_quantity := v_quantity_numeric::bigint;

        IF v_product_id = ANY (v_product_ids) THEN
            RAISE EXCEPTION 'A product may appear only once in a sale'
                USING ERRCODE = '22023';
        END IF;

        v_product_ids := pg_catalog.array_append(v_product_ids, v_product_id);
        v_quantities := pg_catalog.array_append(v_quantities, v_quantity);
    END LOOP;

    v_item_count := pg_catalog.cardinality(v_product_ids);

    FOR v_locked_product_id IN
        SELECT requested.product_id
        FROM pg_catalog.unnest(v_product_ids) AS requested(product_id)
        ORDER BY requested.product_id
    LOOP
        PERFORM 1
        FROM public.products AS p
        WHERE p.id = v_locked_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not exist', v_locked_product_id
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    FOR v_index IN 1..v_item_count LOOP
        SELECT p.name, p.price, p.stock, p.is_active
        INTO v_product_name, v_product_price, v_product_stock,
             v_product_is_active
        FROM public.products AS p
        WHERE p.id = v_product_ids[v_index];

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not exist', v_product_ids[v_index]
                USING ERRCODE = '22023';
        END IF;

        IF v_product_is_active IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Archived products cannot be sold'
                USING ERRCODE = '23514';
        END IF;

        IF v_product_price < 0
           OR v_product_price > 9999999999.99::numeric THEN
            RAISE EXCEPTION 'Product price is outside numeric(12,2)'
                USING ERRCODE = '22003';
        END IF;

        IF v_product_stock < v_quantities[v_index] THEN
            RAISE EXCEPTION 'Insufficient stock for product %',
                v_product_ids[v_index]
                USING ERRCODE = '23514';
        END IF;

        v_stock_after := v_product_stock - v_quantities[v_index];
        v_subtotal := v_product_price * v_quantities[v_index]::numeric;

        IF v_subtotal < 0
           OR v_subtotal > 9999999999.99::numeric THEN
            RAISE EXCEPTION 'Sale subtotal is outside numeric(12,2)'
                USING ERRCODE = '22003';
        END IF;

        v_total := v_total + v_subtotal;
        IF v_total > 9999999999.99::numeric THEN
            RAISE EXCEPTION 'Sale total is outside numeric(12,2)'
                USING ERRCODE = '22003';
        END IF;

        v_product_names := pg_catalog.array_append(
            v_product_names,
            v_product_name
        );
        v_unit_prices := pg_catalog.array_append(
            v_unit_prices,
            v_product_price
        );
        v_stock_befores := pg_catalog.array_append(
            v_stock_befores,
            v_product_stock
        );
        v_stock_afters := pg_catalog.array_append(
            v_stock_afters,
            v_stock_after
        );
        v_subtotals := pg_catalog.array_append(v_subtotals, v_subtotal);
    END LOOP;

    INSERT INTO public.transactions (created_by, total)
    VALUES (auth.uid(), v_total)
    RETURNING id INTO v_transaction_id;

    FOR v_index IN 1..v_item_count LOOP
        INSERT INTO public.transaction_items (
            transaction_id,
            product_id,
            product_name_snapshot,
            quantity,
            unit_price,
            subtotal
        )
        VALUES (
            v_transaction_id,
            v_product_ids[v_index],
            v_product_names[v_index],
            v_quantities[v_index],
            v_unit_prices[v_index],
            v_subtotals[v_index]
        )
        RETURNING id INTO v_transaction_item_id;

        UPDATE public.products AS p
        SET stock = v_stock_afters[v_index]
        WHERE p.id = v_product_ids[v_index];

        INSERT INTO public.stock_movements (
            product_id,
            transaction_item_id,
            movement_type,
            quantity_change,
            stock_before,
            stock_after,
            created_by
        )
        VALUES (
            v_product_ids[v_index],
            v_transaction_item_id,
            'sale'::public.stock_movement_type,
            -v_quantities[v_index],
            v_stock_befores[v_index],
            v_stock_afters[v_index],
            auth.uid()
        );
    END LOOP;

    RETURN v_transaction_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_product(text, uuid, numeric, bigint)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_stock(uuid, bigint, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_sale(jsonb)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_product(text, uuid, numeric, bigint)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, bigint, text)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale(jsonb)
    TO authenticated;
