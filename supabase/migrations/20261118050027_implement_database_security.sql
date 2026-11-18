CREATE SCHEMA internal;

REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA internal TO authenticated;

CREATE FUNCTION internal.current_profile_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = auth.uid()
          AND p.is_active
    );
$function$;

CREATE FUNCTION internal.require_active_product_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    category_is_active boolean;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT c.is_active
    INTO category_is_active
    FROM public.categories AS c
    WHERE c.id = NEW.category_id
    FOR SHARE;

    IF NOT FOUND OR NOT category_is_active THEN
        RAISE EXCEPTION 'Product category must exist and be active'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION internal.current_profile_is_active()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal.require_active_product_category()
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION internal.current_profile_is_active()
    TO authenticated;

CREATE TRIGGER products_require_active_category
    BEFORE INSERT OR UPDATE OF category_id
    ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION internal.require_active_product_category();

REVOKE ALL PRIVILEGES ON TABLE
    public.profiles,
    public.categories,
    public.products,
    public.transactions,
    public.transaction_items,
    public.stock_movements
FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE public.transactions_receipt_number_seq
    FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
    public.profiles,
    public.categories,
    public.products,
    public.transactions,
    public.transaction_items,
    public.stock_movements
TO authenticated;

GRANT UPDATE (display_name)
    ON TABLE public.profiles
    TO authenticated;

GRANT INSERT (name, description, is_active),
      UPDATE (name, description, is_active)
    ON TABLE public.categories
    TO authenticated;

GRANT UPDATE (name, category_id, price, is_active)
    ON TABLE public.products
    TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own_active
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        (SELECT internal.current_profile_is_active())
        AND id = (SELECT auth.uid())
    );

CREATE POLICY profiles_update_own_display_name
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT internal.current_profile_is_active())
        AND id = (SELECT auth.uid())
    )
    WITH CHECK (
        (SELECT internal.current_profile_is_active())
        AND id = (SELECT auth.uid())
    );

CREATE POLICY categories_select_active_profiles
    ON public.categories
    FOR SELECT
    TO authenticated
    USING (
        (SELECT internal.current_profile_is_active())
    );

CREATE POLICY categories_insert_active_profiles
    ON public.categories
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT internal.current_profile_is_active())
    );

CREATE POLICY categories_update_active_profiles
    ON public.categories
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT internal.current_profile_is_active())
    )
    WITH CHECK (
        (SELECT internal.current_profile_is_active())
    );

CREATE POLICY products_select_active_profiles
    ON public.products
    FOR SELECT
    TO authenticated
    USING (
        (SELECT internal.current_profile_is_active())
    );

CREATE POLICY products_update_active_profiles
    ON public.products
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT internal.current_profile_is_active())
    )
    WITH CHECK (
        (SELECT internal.current_profile_is_active())
    );

CREATE POLICY transactions_select_active_profiles
    ON public.transactions
    FOR SELECT
    TO authenticated
    USING (
        (SELECT internal.current_profile_is_active())
    );

CREATE POLICY transaction_items_select_active_profiles
    ON public.transaction_items
    FOR SELECT
    TO authenticated
    USING (
        (SELECT internal.current_profile_is_active())
    );

CREATE POLICY stock_movements_select_active_profiles
    ON public.stock_movements
    FOR SELECT
    TO authenticated
    USING (
        (SELECT internal.current_profile_is_active())
    );
