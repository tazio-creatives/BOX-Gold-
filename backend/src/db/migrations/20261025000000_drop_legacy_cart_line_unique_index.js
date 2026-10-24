// Drops the legacy cart-line uniqueness index left over from the move to
// product variants (20260830020000_cart_items_variant_unique_index.js said
// it would go in a later cleanup; it never did).
//
// cart_items_line_unique_idx is keyed on (cart_id, product_id) plus four
// legacy selection columns (product_size_id, gold_color, purity,
// diamond_config_id) that nothing writes any more — always NULL — so it
// collapses to UNIQUE(cart_id, product_id) and rejects a second variant of
// the same product (Yellow + Rose, two sizes, two purities) with a unique
// violation, and silently breaks the guest→customer cart merge on login.
//
// A cart line's identity is already cart_items_variant_unique_idx
// (cart_id, product_variant_id), which every cart write targets with
// ON CONFLICT — it stays exactly as is. No rows are touched.
//
// DROP INDEX CONCURRENTLY can't run inside a transaction, hence
// noTransaction(); it doesn't block cart reads/writes while it runs.

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS cart_items_line_unique_idx;');
};

// Recreates the old index. Refuses — changing nothing — if carts now hold
// several variants of one product (which the old index can't represent);
// those lines would have to be removed by hand first, which this never does.
export const down = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE conflicts integer;
    BEGIN
      SELECT COUNT(*) INTO conflicts FROM (
        SELECT 1 FROM cart_items
        GROUP BY cart_id, product_id, COALESCE(product_size_id::text, ''), COALESCE(gold_color, ''),
                 COALESCE(purity, ''), COALESCE(diamond_config_id::text, '')
        HAVING COUNT(*) > 1
      ) s;
      IF conflicts > 0 THEN
        RAISE EXCEPTION 'Cannot restore cart_items_line_unique_idx: % cart(s) hold more than one variant of the same product. No cart lines were changed.', conflicts;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS cart_items_line_unique_idx ON cart_items (
      cart_id, product_id,
      COALESCE(product_size_id::text, ''),
      COALESCE(gold_color, ''),
      COALESCE(purity, ''),
      COALESCE(diamond_config_id::text, '')
    );
  `);
};
