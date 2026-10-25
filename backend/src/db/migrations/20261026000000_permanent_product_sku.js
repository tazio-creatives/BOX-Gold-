// Permanent, server-generated product SKUs: BD-{TYPE}-{NUMBER}, e.g.
// BD-RNG-001024. Additive only — nothing existing is rewritten here; the
// one-off move of DRAFT-<timestamp> codes is scripts/migrateDraftSkus.js.
//
// - products.jewellery_type: WHAT the piece is (ring, pendant, …) — the SKU
//   prefix comes from this, never from the website category (Gents/Kids are
//   audiences, and categories can change). Same vocabulary as AI Studio's
//   ai_studio_jobs.jewellery_type, minus UNKNOWN. Nullable: older products get
//   it from the migration script; new ones are required to have it.
// - products.legacy_sku: the code a product had before it got a permanent
//   SKU, kept for admin search and old-to-new mapping. Unique when present, so
//   one old code can never point at two products.
// - product_sku_seq: one global sequence for the number part. nextval() is
//   atomic, so concurrent product creation can never get the same number
//   (gaps after a rolled-back insert are fine — products.sku stays UNIQUE).
//
// order_items.product_sku (the code frozen on each order line) is untouched.

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE products
      ADD COLUMN jewellery_type TEXT
        CONSTRAINT products_jewellery_type_check CHECK (jewellery_type IN (
          'RING', 'BRACELET', 'BANGLE', 'NECKLACE', 'EARRINGS', 'PENDANT', 'CHAIN',
          'ANKLET', 'NOSE_PIN', 'MANGALSUTRA', 'BROOCH', 'OTHER')),
      ADD COLUMN legacy_sku TEXT;

    CREATE UNIQUE INDEX products_legacy_sku_unique_idx ON products (legacy_sku) WHERE legacy_sku IS NOT NULL;

    CREATE SEQUENCE product_sku_seq START WITH 1001 MINVALUE 1 NO CYCLE;
  `);
};

export const down = (pgm) => {
  // Refuses rather than losing the old codes once any product was migrated —
  // restore those first (scripts/migrateDraftSkus.js --restore=<change log>).
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM products WHERE legacy_sku IS NOT NULL) THEN
        RAISE EXCEPTION 'products still carry legacy_sku values (migrated SKUs) — run migrateDraftSkus.js --restore first. Nothing was changed.';
      END IF;
    END $$;

    DROP SEQUENCE product_sku_seq;
    DROP INDEX products_legacy_sku_unique_idx;
    ALTER TABLE products DROP COLUMN legacy_sku, DROP COLUMN jewellery_type;
  `);
};
