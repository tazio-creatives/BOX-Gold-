// Gold-colour labels on product photos, so the cart, checkout, order pages
// and emails can show the photo matching the colour the customer chose
// instead of always the product's featured photo.
//
// product_images has no photo-group row — one photo is the 9 size/format
// rows sharing (product_id, sort_order) — so both labels are written to all
// 9 rows of a group by every writer. Defaults are 'ANY'/'OTHER', which the
// image resolver treats exactly like today (featured photo), so this
// migration alone changes nothing a customer sees. Values match the
// gold_color attribute codes (attribute_values.value) plus 'ANY'.
//
// order_items gets a URL snapshot of the photo resolved at checkout, so
// order history and already-sent emails don't change when the gallery does.
// Both nullable: orders placed before this keep the live lookup.

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE product_images
      ADD COLUMN gold_colour TEXT NOT NULL DEFAULT 'ANY'
        CONSTRAINT product_images_gold_colour_check CHECK (gold_colour IN ('YELLOW', 'ROSE', 'WHITE', 'ANY')),
      ADD COLUMN shot_type TEXT NOT NULL DEFAULT 'OTHER'
        CONSTRAINT product_images_shot_type_check
          CHECK (shot_type IN ('FRONT', 'ANGLE', 'SIDE', 'MACRO', 'MODEL', 'SIZE_GUIDE', 'OTHER'));

    ALTER TABLE order_items
      ADD COLUMN image_url TEXT,
      ADD COLUMN image_large_url TEXT;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE order_items DROP COLUMN image_large_url, DROP COLUMN image_url;
    ALTER TABLE product_images DROP COLUMN shot_type, DROP COLUMN gold_colour;
  `);
};
