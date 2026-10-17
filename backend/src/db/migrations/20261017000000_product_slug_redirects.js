// Old product slugs that should 301 to the product's current URL — written
// whenever a product's slug changes (admin edit, or the one-off clean-up of
// number-only and accent-mangled slugs in scripts/fixProductSlugs.js), so
// links already shared or indexed by search engines keep working.

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE product_slug_redirects (
      old_slug TEXT PRIMARY KEY,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX product_slug_redirects_product_id_idx ON product_slug_redirects (product_id);
  `);
};

export const down = (pgm) => {
  pgm.sql('DROP TABLE product_slug_redirects;');
};
