// Phase 1 dev seed: foundational reference data only (admin role/user, categories,
// collections, current gold/diamond rates, a couple of sample products) — not
// orders/carts/reviews, since those require application flows from later phases.
//
// Deliberately uses its own pg Client rather than the shared pool (that's a
// Phase 2 deliverable — "Backend core: db pool"). Idempotent: safe to re-run.

import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcrypt';

const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    const {
      rows: [role],
    } = await client.query(
      `INSERT INTO admin_roles (name, permissions)
       VALUES ('SUPER_ADMIN', '["*"]')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );

    const passwordHash = await bcrypt.hash('dev-only-password', 12);
    await client.query(
      `INSERT INTO admin_users (email, password_hash, full_name, role_id)
       VALUES ('admin@boxdiamonds.dev', $1, 'Dev Admin', $2)
       ON CONFLICT (email) DO NOTHING`,
      [passwordHash, role.id],
    );

    const {
      rows: [rings],
    } = await client.query(
      `INSERT INTO categories (name, slug, sort_order)
       VALUES ('Rings', 'rings', 1)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const {
      rows: [diamondRings],
    } = await client.query(
      `INSERT INTO categories (parent_id, name, slug, sort_order)
       VALUES ($1, 'Diamond Rings', 'diamond-rings', 1)
       ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id
       RETURNING id`,
      [rings.id],
    );
    await client.query(
      `INSERT INTO categories (name, slug, sort_order)
       VALUES ('Earrings', 'earrings', 2), ('Necklaces', 'necklaces', 3)
       ON CONFLICT (slug) DO NOTHING`,
    );

    const {
      rows: [signature],
    } = await client.query(
      `INSERT INTO collections (name, slug, description)
       VALUES ('Signature Collection', 'signature-collection', 'Editorial pieces, spotlighted on the homepage')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );

    for (const [purity, rate] of [
      ['24K', 7420.0],
      ['22K', 6802.0],
      ['18K', 5565.0],
      ['14K', 4328.0],
      ['9K', 2782.5],
    ]) {
      await client.query(
        `INSERT INTO gold_rates (purity, rate_per_gram, source) VALUES ($1, $2, 'seed')`,
        [purity, rate],
      );
    }
    await client.query(`INSERT INTO diamond_rates (rate_per_carat) VALUES (55000.0)`);

    const {
      rows: [{ id: earringsId }],
    } = await client.query(`SELECT id FROM categories WHERE slug = 'earrings'`);
    const {
      rows: [{ id: necklacesId }],
    } = await client.query(`SELECT id FROM categories WHERE slug = 'necklaces'`);

    const {
      rows: [product],
    } = await client.query(
      `INSERT INTO products (
         name, sku, category_id, collection_id, short_description, full_description,
         metal_type, purity, gross_weight_grams, net_weight_grams, diamond_weight_carats,
         diamond_count, diamond_type, diamond_colour, diamond_clarity, certification,
         product_size, gold_value, diamond_value, making_charge, gst_percent, mrp,
         selling_price, stock_quantity, status, slug, meta_title, meta_description
       )
       VALUES (
         'Celeste Diamond Ring', 'BD-RING-0001', $1, $2,
         'A solitaire diamond ring in 18K yellow gold.',
         'A solitaire diamond ring in 18K yellow gold, hand-finished with a single brilliant-cut diamond.',
         'GOLD', '18K', 4.200, 3.900, 0.300,
         1, 'Natural', 'F', 'VVS1', 'IGI Certified',
         'Standard', 21703.50, 16500.00, 3950.00, 3.00, 45000.00,
         42153.50, 5, 'PUBLISHED', 'celeste-diamond-ring',
         'Celeste Diamond Ring | BOX DIAMONDS',
         'A solitaire diamond ring in 18K yellow gold, IGI certified.'
       )
       ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [diamondRings.id, signature.id],
    );

    // Additional catalog spread (Phase 7): PLP filters/sort/pagination need
    // more than one product to actually exercise metal/purity/price/stock
    // variety — not present data, just enough to verify against.
    async function upsertProduct(fields) {
      const columns = Object.keys(fields);
      const values = Object.values(fields);
      const placeholders = columns.map((_, i) => `$${i + 1}`);
      const {
        rows: [row],
      } = await client.query(
        `INSERT INTO products (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
         ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        values,
      );
      return row;
    }

    const productSeeds = [
      {
        name: 'Aurora Diamond Earrings',
        sku: 'BD-EARR-0001',
        category_id: earringsId,
        collection_id: null,
        short_description: 'Diamond drop earrings in 22K gold.',
        full_description: 'Diamond drop earrings in 22K gold, set with brilliant-cut diamonds.',
        metal_type: 'GOLD',
        purity: '22K',
        gross_weight_grams: 7.0,
        net_weight_grams: 6.5,
        diamond_weight_carats: 0.4,
        diamond_count: 2,
        diamond_type: 'Natural',
        diamond_colour: 'G',
        diamond_clarity: 'VS1',
        certification: 'IGI Certified',
        gold_value: 44213.0,
        diamond_value: 22000.0,
        making_charge: 4200.0,
        gst_percent: 3.0,
        mrp: 78000.0,
        selling_price: 72525.39,
        stock_quantity: 8,
        status: 'PUBLISHED',
        slug: 'aurora-diamond-earrings',
      },
      {
        name: 'Everly Gold Necklace',
        sku: 'BD-NECK-0001',
        category_id: necklacesId,
        collection_id: null,
        short_description: 'Plain 24K gold chain necklace.',
        full_description: 'A classic 24K gold chain necklace, hand-finished.',
        metal_type: 'GOLD',
        purity: '24K',
        gross_weight_grams: 13.2,
        net_weight_grams: 12.8,
        diamond_weight_carats: 0,
        diamond_count: 0,
        making_charge: 6500.0,
        gold_value: 94976.0,
        diamond_value: 0,
        gst_percent: 3.0,
        mrp: 110000.0,
        selling_price: 104520.28,
        stock_quantity: 4,
        status: 'PUBLISHED',
        slug: 'everly-gold-necklace',
      },
      {
        name: 'Solstice Platinum Solitaire',
        sku: 'BD-RING-0002',
        category_id: diamondRings.id,
        collection_id: signature.id,
        short_description: 'Platinum solitaire ring with a brilliant-cut diamond.',
        full_description:
          'A platinum solitaire ring set with a brilliant-cut diamond — platinum value is admin-set, priced manually like diamonds.',
        metal_type: 'PLATINUM',
        purity: null,
        gross_weight_grams: 6.5,
        net_weight_grams: 6.0,
        diamond_weight_carats: 0.8,
        diamond_count: 1,
        diamond_type: 'Natural',
        diamond_colour: 'F',
        diamond_clarity: 'VVS2',
        certification: 'IGI Certified',
        gold_value: 55000.0,
        diamond_value: 44000.0,
        making_charge: 8500.0,
        gst_percent: 3.0,
        mrp: 118000.0,
        selling_price: 110725.0,
        stock_quantity: 3,
        status: 'PUBLISHED',
        slug: 'solstice-platinum-solitaire',
      },
      {
        name: 'Petite Gold Hoops',
        sku: 'BD-EARR-0002',
        category_id: earringsId,
        collection_id: null,
        short_description: 'Everyday 14K gold hoop earrings.',
        full_description: 'Lightweight everyday hoop earrings in 14K gold.',
        metal_type: 'GOLD',
        purity: '14K',
        gross_weight_grams: 2.4,
        net_weight_grams: 2.2,
        diamond_weight_carats: 0,
        diamond_count: 0,
        making_charge: 1200.0,
        gold_value: 9521.6,
        diamond_value: 0,
        gst_percent: 3.0,
        mrp: 12000.0,
        selling_price: 11043.25,
        stock_quantity: 15,
        status: 'PUBLISHED',
        slug: 'petite-gold-hoops',
      },
      {
        name: 'Radiance Diamond Pendant',
        sku: 'BD-NECK-0002',
        category_id: necklacesId,
        collection_id: signature.id,
        short_description: 'Diamond pendant necklace in 18K gold.',
        full_description: 'A diamond solitaire pendant on an 18K gold chain.',
        metal_type: 'GOLD',
        purity: '18K',
        gross_weight_grams: 5.5,
        net_weight_grams: 5.1,
        diamond_weight_carats: 0.5,
        diamond_count: 1,
        diamond_type: 'Natural',
        diamond_colour: 'F',
        diamond_clarity: 'VVS1',
        certification: 'IGI Certified',
        gold_value: 28381.5,
        diamond_value: 27500.0,
        making_charge: 4800.0,
        gst_percent: 3.0,
        mrp: 68000.0,
        selling_price: 62501.95,
        stock_quantity: 6,
        status: 'PUBLISHED',
        slug: 'radiance-diamond-pendant',
      },
      {
        name: 'Vintage Diamond Ring',
        sku: 'BD-RING-0003',
        category_id: diamondRings.id,
        collection_id: null,
        short_description: 'Vintage-inspired diamond ring in 22K gold.',
        full_description: 'A vintage-inspired diamond cluster ring in 22K gold.',
        metal_type: 'GOLD',
        purity: '22K',
        gross_weight_grams: 6.4,
        net_weight_grams: 6.0,
        diamond_weight_carats: 0.6,
        diamond_count: 3,
        diamond_type: 'Natural',
        diamond_colour: 'G',
        diamond_clarity: 'VS2',
        certification: 'IGI Certified',
        gold_value: 40812.0,
        diamond_value: 33000.0,
        making_charge: 5200.0,
        gst_percent: 3.0,
        mrp: 88000.0,
        selling_price: 81382.36,
        // Deliberately out of stock — exercises the PDP "Out of Stock" state.
        stock_quantity: 0,
        status: 'PUBLISHED',
        slug: 'vintage-diamond-ring',
      },
      {
        name: 'Whisper Gold Studs',
        sku: 'BD-EARR-0003',
        category_id: earringsId,
        collection_id: null,
        short_description: 'Minimal 18K gold stud earrings.',
        full_description: 'Minimal everyday stud earrings in 18K gold.',
        metal_type: 'GOLD',
        purity: '18K',
        gross_weight_grams: 2.0,
        net_weight_grams: 1.8,
        diamond_weight_carats: 0,
        diamond_count: 0,
        making_charge: 1500.0,
        gold_value: 10017.0,
        diamond_value: 0,
        gst_percent: 3.0,
        mrp: 12800.0,
        selling_price: 11862.51,
        // Deliberately low stock — exercises the "Only 2 left" PDP badge.
        stock_quantity: 2,
        status: 'PUBLISHED',
        slug: 'whisper-gold-studs',
      },
      {
        name: 'Classic Gold Band',
        sku: 'BD-RING-0004',
        category_id: rings.id,
        collection_id: null,
        short_description: 'Plain 24K gold wedding band.',
        full_description: 'A plain, timeless 24K gold wedding band.',
        metal_type: 'GOLD',
        purity: '24K',
        gross_weight_grams: 8.3,
        net_weight_grams: 8.0,
        diamond_weight_carats: 0,
        diamond_count: 0,
        making_charge: 3000.0,
        gold_value: 59360.0,
        diamond_value: 0,
        gst_percent: 3.0,
        mrp: 68000.0,
        selling_price: 64230.8,
        stock_quantity: 10,
        status: 'PUBLISHED',
        slug: 'classic-gold-band',
        is_price_locked: true,
      },
      {
        name: 'Diamond Tennis Necklace',
        sku: 'BD-NECK-0003',
        category_id: necklacesId,
        collection_id: signature.id,
        short_description: 'Statement diamond tennis necklace in 18K gold.',
        full_description: 'A statement diamond tennis necklace in 18K gold, 45 brilliant-cut diamonds.',
        metal_type: 'GOLD',
        purity: '18K',
        gross_weight_grams: 15.8,
        net_weight_grams: 15.0,
        diamond_weight_carats: 3.5,
        diamond_count: 45,
        diamond_type: 'Natural',
        diamond_colour: 'F',
        diamond_clarity: 'VVS1',
        certification: 'IGI Certified',
        gold_value: 83475.0,
        diamond_value: 192500.0,
        making_charge: 15000.0,
        gst_percent: 3.0,
        mrp: 320000.0,
        selling_price: 299704.25,
        stock_quantity: 2,
        status: 'PUBLISHED',
        slug: 'diamond-tennis-necklace',
      },
    ];

    for (const seed of productSeeds) {
      await upsertProduct(seed);
    }

    // Homepage sections/items (plan §3 Homepage structure, items 3-14 — the
    // 12 dynamic, admin-configurable sections; Announcement/Header/Footer
    // are layout chrome, not homepage_sections rows). Re-seedable: clears
    // and rebuilds these known section types each run.
    const SECTION_TYPES = [
      'HERO',
      'BENTO_CATEGORIES',
      'NEW_ARRIVALS',
      'COLLECTION_CARDS',
      'SHOP_BY_MATERIAL',
      'FEATURED_PRODUCT',
      'BEST_SELLERS',
      'SHOP_BY_PRICE',
      'OCCASION_CARDS',
      'INSTAGRAM',
      'NEWSLETTER',
      'TRUST_STRIP',
    ];
    await client.query(
      `DELETE FROM homepage_items WHERE section_id IN
         (SELECT id FROM homepage_sections WHERE type = ANY($1))`,
      [SECTION_TYPES],
    );
    await client.query(`DELETE FROM homepage_sections WHERE type = ANY($1)`, [SECTION_TYPES]);

    async function createSection(type, heading, sortOrder, items) {
      const {
        rows: [section],
      } = await client.query(
        `INSERT INTO homepage_sections (type, heading, sort_order) VALUES ($1, $2, $3) RETURNING id`,
        [type, heading, sortOrder],
      );
      for (const [i, item] of items.entries()) {
        await client.query(
          `INSERT INTO homepage_items
             (section_id, image_url, heading, cta_label, cta_url, category_id, collection_id, product_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            section.id,
            item.imageUrl ?? null,
            item.heading ?? null,
            item.ctaLabel ?? null,
            item.ctaUrl ?? null,
            item.categoryId ?? null,
            item.collectionId ?? null,
            item.productId ?? null,
            i,
          ],
        );
      }
    }

    await createSection('HERO', 'Timeless Diamonds, Modern Craft', 1, [
      { heading: 'Discover the Signature Collection', ctaLabel: 'Shop Now', ctaUrl: '/rings' },
    ]);
    await createSection('BENTO_CATEGORIES', 'Shop by Category', 2, [
      { heading: 'Rings', ctaLabel: 'Shop Rings', categoryId: rings.id },
      { heading: 'Earrings', ctaLabel: 'Shop Earrings', categoryId: earringsId },
      { heading: 'Necklaces', ctaLabel: 'Shop Necklaces', categoryId: necklacesId },
    ]);
    await createSection('NEW_ARRIVALS', 'New Arrivals', 3, [
      { heading: 'Just In', productId: product.id },
    ]);
    await createSection('COLLECTION_CARDS', 'Curated Collections', 4, [
      {
        heading: 'Signature Collection',
        ctaLabel: 'Explore',
        collectionId: signature.id,
      },
    ]);
    await createSection('SHOP_BY_MATERIAL', 'Shop by Material', 5, [
      { heading: 'Yellow Gold', ctaUrl: '/products?metal=GOLD' },
      { heading: 'Platinum', ctaUrl: '/products?metal=PLATINUM' },
    ]);
    await createSection('FEATURED_PRODUCT', 'The Signature Piece', 6, [
      { heading: 'Celeste Diamond Ring', productId: product.id },
    ]);
    await createSection('BEST_SELLERS', 'Most Loved', 7, [
      { heading: 'Celeste Diamond Ring', productId: product.id },
    ]);
    await createSection('SHOP_BY_PRICE', 'Shop by Price', 8, [
      { heading: 'Under ₹25,000', ctaUrl: '/products?priceMax=25000' },
      { heading: '₹25,000 – ₹50,000', ctaUrl: '/products?priceMin=25000&priceMax=50000' },
      { heading: 'Above ₹50,000', ctaUrl: '/products?priceMin=50000' },
    ]);
    await createSection('OCCASION_CARDS', 'Shop by Occasion', 9, [
      { heading: 'Wedding', ctaUrl: '/rings' },
      { heading: 'Gifting', ctaUrl: '/products' },
    ]);
    await createSection('INSTAGRAM', 'Inspiration', 10, [
      { heading: '@boxdiamonds' },
      { heading: '@boxdiamonds' },
      { heading: '@boxdiamonds' },
    ]);
    await createSection('NEWSLETTER', 'Stay in the Loop', 11, []);
    await createSection('TRUST_STRIP', null, 12, [
      { heading: 'Free Insured Shipping' },
      { heading: 'Easy Returns' },
      { heading: 'Lifetime Exchange' },
      { heading: 'Certified Jewellery' },
    ]);

    await client.query('COMMIT');
    console.log('Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
