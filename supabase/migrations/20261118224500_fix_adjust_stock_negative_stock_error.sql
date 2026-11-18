CREATE OR REPLACE FUNCTION public.adjust_stock(
    p_product_id uuid,
    p_delta bigint,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

    -- Reject insufficient stock
    IF v_stock_after_numeric < 0 THEN
        RAISE EXCEPTION 'Insufficient stock'
            USING ERRCODE = '23514';
    END IF;

    -- Reject bigint overflow
    IF v_stock_after_numeric > 9223372036854775807::numeric THEN
        RAISE EXCEPTION 'Adjusted stock exceeds the bigint range'
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