import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFeedItems,
  renderFeedXml,
  feedGroupId,
  feedItemId,
  priceBand,
} from '../../src/services/metaCatalogFeed.js';
import {
  selectionFor,
  resolveVariantId,
  imageUrlsForColour,
} from '../../src/services/metaCatalogService.js';

// Pure tests — no database. The feed's DB-facing half (metaCatalogService's
// getCatalogProducts) prices through previewProductVariantPricing, the PDP's
// own function, so only the selection/feed rules need pinning here.

const SITE = 'https://boxdiamonds.com';

function catalogProduct(overrides = {}) {
  return {
    id: 'p-1',
    sku: 'BD-RNG-001001',
    name: 'Promesseria Diamond Ring',
    path: '/rings/promesseria-diamond-ring',
    description: '<p>An everyday single-diamond ring.</p>',
    type: 'Ring',
    gender: 'female',
    ageGroup: 'adult',
    hasDiamonds: true,
    diamondCount: 1,
    certification: 'IGI',
    skipReasons: [],
    variants: [
      {
        purity: '18K',
        goldColor: 'ROSE',
        diamondQuality: 'SI1 IJ',
        diamondCarats: 0.01,
        sellingPrice: 12000,
        strikePrice: 0,
        imageUrls: ['https://cdn.example/a-original.jpeg', 'https://cdn.example/b-original.jpeg'],
      },
    ],
    ...overrides,
  };
}

describe('Meta catalogue feed items', () => {
  test('group id is the SKU the Pixel already sends; item id adds purity and colour', () => {
    const product = catalogProduct();
    assert.equal(feedGroupId(product), 'BD-RNG-001001');
    assert.equal(feedItemId(product, product.variants[0]), 'BD-RNG-001001-18k-rose');
    assert.equal(feedGroupId({ id: 'uuid-1', sku: null }), 'uuid-1');
    assert.equal(feedItemId(product, { purity: null, goldColor: null }), 'BD-RNG-001001-1');
  });

  test('builds a complete item that links to the exact variant', () => {
    const { items, skipped } = buildFeedItems([catalogProduct()], { siteUrl: SITE });
    assert.deepEqual(skipped, []);
    assert.equal(items.length, 1);
    const item = items[0];
    assert.equal(item.title, 'Promesseria Diamond Ring, 18K Rose Gold');
    assert.equal(item.price, '12000.00 INR');
    assert.equal(item.sale_price, undefined);
    assert.equal(item.link, `${SITE}/rings/promesseria-diamond-ring?purity=18K&colour=rose`);
    assert.equal(item.image_link, 'https://cdn.example/a-original.jpeg');
    assert.equal(item.additional_image_link, 'https://cdn.example/b-original.jpeg');
    assert.equal(item.availability, 'in stock');
    assert.equal(item.brand, 'BOX DIAMONDS');
    assert.equal(item.color, 'Rose Gold');
    assert.equal(item.material, '18K Rose Gold, Diamond');
    assert.equal(item.google_product_category, 'Apparel & Accessories > Jewelry > Rings');
    assert.match(
      item.description,
      /^An everyday single-diamond ring\. Set with 1 natural diamond \(0\.01 ct total, SI1 IJ\)\. IGI certified\. Crafted in 18K rose gold\.$/,
    );
  });

  test('a discounted variant shows the strike price as price and the charged price as sale_price', () => {
    const product = catalogProduct();
    product.variants[0].strikePrice = 15000;
    const [item] = buildFeedItems([product], { siteUrl: SITE }).items;
    assert.equal(item.price, '15000.00 INR');
    assert.equal(item.sale_price, '12000.00 INR');
    assert.equal(item.custom_label_0, '10k-20k'); // banded on what the shopper pays
  });

  test('"IGI Certified" is not repeated as "certified certified"', () => {
    const [item] = buildFeedItems([catalogProduct({ certification: 'IGI Certified' })], {
      siteUrl: SITE,
    }).items;
    assert.match(item.description, /IGI Certified\. Crafted/);
  });

  test('skips variants Meta would reject, and reports why', () => {
    const product = catalogProduct();
    product.variants.push(
      { ...product.variants[0], goldColor: 'YELLOW', sellingPrice: 0 },
      { ...product.variants[0], goldColor: 'WHITE', imageUrls: [] },
    );
    const noPage = catalogProduct({ sku: 'BD-RNG-001002', path: null });
    const { items, skipped } = buildFeedItems([product, noPage], { siteUrl: SITE });
    assert.equal(items.length, 1);
    assert.deepEqual(
      skipped.map((s) => s.reason),
      [
        'price missing or zero',
        'no JPEG photo (original upload) for this gold colour',
        'no product page URL (no category assigned)',
      ],
    );
  });

  test('flags data Meta reviewers would question without hiding the product', () => {
    const { items, warnings } = buildFeedItems(
      [catalogProduct({ certification: 'IGI, GII, GIG' })],
      { siteUrl: SITE },
    );
    assert.equal(items.length, 1);
    assert.deepEqual(
      warnings.map((w) => w.warning),
      ['certification lists several labs: "IGI, GII, GIG"'],
    );
  });

  test('price bands', () => {
    assert.equal(priceBand(4999), 'under-5k');
    assert.equal(priceBand(5000), '5k-10k');
    assert.equal(priceBand(29999.99), '20k-30k');
    assert.equal(priceBand(30000), '30k-plus');
  });

  test('XML escapes text and drops characters XML cannot hold', () => {
    const product = catalogProduct({ name: 'Rings & <Bands> "Duo"\u0001' });
    const xml = renderFeedXml(buildFeedItems([product], { siteUrl: SITE }).items, {
      siteUrl: SITE,
    });
    assert.match(
      xml,
      /<g:title>Rings &amp; &lt;Bands&gt; &quot;Duo&quot;, 18K Rose Gold<\/g:title>/,
    );
    assert.equal(xml.includes('\u0001'), false);
    assert.match(
      xml,
      /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss xmlns:g="http:\/\/base.google.com\/ns\/1.0" version="2.0">/,
    );
  });
});

// A ProductDetail (toDetailDto) shaped fixture: purity 14K/18K × colour
// YELLOW/ROSE × diamond GH/IJ, where GH isn't offered in 18K (an
// Availability Rule) and Rose isn't made in 14K.
function detailProduct() {
  const ids = {
    k14: 'av-14k',
    k18: 'av-18k',
    yellow: 'av-yellow',
    rose: 'av-rose',
    gh: 'av-gh',
    ij: 'av-ij',
    s6: 'av-s6',
    s8: 'av-s8',
  };
  const variants = [];
  for (const purity of ['k14', 'k18']) {
    for (const colour of ['yellow', 'rose']) {
      for (const diamond of ['gh', 'ij']) {
        for (const size of ['s6', 's8']) {
          const isAvailable =
            !(purity === 'k18' && diamond === 'gh') && !(purity === 'k14' && colour === 'rose');
          variants.push({
            id: `v-${purity}-${colour}-${diamond}-${size}`,
            isAvailable,
            attributeValueIds: [ids[purity], ids[colour], ids[diamond], ids[size]],
          });
        }
      }
    }
  }
  return {
    purity: '14K',
    goldColor: 'YELLOW',
    diamondConfigId: 'dc-gh',
    purityOptions: ['14K', '18K'],
    goldColorOptions: ['YELLOW', 'ROSE'],
    diamondOptions: [
      { id: 'dc-gh', name: 'VVS GH' },
      { id: 'dc-ij', name: 'SI1 IJ' },
    ],
    sizes: [
      { id: ids.s8, label: '8' },
      { id: ids.s6, label: '6' },
    ],
    attributes: [
      {
        code: 'purity',
        values: [
          { id: ids.k14, value: '14K', refId: null },
          { id: ids.k18, value: '18K', refId: null },
        ],
      },
      {
        code: 'gold_color',
        values: [
          { id: ids.yellow, value: 'YELLOW', refId: null },
          { id: ids.rose, value: 'ROSE', refId: null },
        ],
      },
      {
        code: 'diamond_quality',
        values: [
          { id: ids.gh, value: 'GH', refId: 'dc-gh' },
          { id: ids.ij, value: 'IJ', refId: 'dc-ij' },
        ],
      },
      {
        code: 'size',
        values: [
          { id: ids.s6, value: '6', refId: null },
          { id: ids.s8, value: '8', refId: null },
        ],
      },
    ],
    variants,
  };
}

describe('Meta catalogue variant selection (mirrors the PDP)', () => {
  test('keeps the admin default diamond quality and the smallest size', () => {
    const product = detailProduct();
    const selection = selectionFor(product, { purity: '14K', goldColor: 'YELLOW' });
    assert.deepEqual(selection, {
      purity: '14K',
      goldColor: 'YELLOW',
      diamondConfigId: 'dc-gh',
      sizeId: 'av-s6',
    });
    assert.equal(resolveVariantId(product, selection), 'v-k14-yellow-gh-s6');
  });

  test("falls back to an available diamond quality when the default isn't offered at that purity", () => {
    const product = detailProduct();
    const selection = selectionFor(product, { purity: '18K', goldColor: 'ROSE' });
    assert.equal(selection.diamondConfigId, 'dc-ij');
    assert.equal(resolveVariantId(product, selection), 'v-k18-rose-ij-s6');
  });

  test('an unavailable combination resolves to no variant', () => {
    const product = detailProduct();
    assert.equal(
      resolveVariantId(product, selectionFor(product, { purity: '14K', goldColor: 'ROSE' })),
      null,
    );
  });
});

describe('Meta catalogue photos', () => {
  const row = (sortOrder, goldColour, shotType, variant, format, extra = {}) => ({
    sort_order: sortOrder,
    type: 'ORIGINAL',
    is_primary: false,
    gold_colour: goldColour,
    shot_type: shotType,
    variant,
    format,
    url: `https://cdn.example/${sortOrder}-${variant}.${format}`,
    ...extra,
  });

  test("uses each colour's own JPEG first, then colour-neutral shots, never other colours or size guides", () => {
    const rows = [
      row(1, 'YELLOW', 'FRONT', 'original', 'jpeg', { is_primary: true }),
      row(1, 'YELLOW', 'FRONT', 'large', 'avif', { is_primary: true }),
      row(2, 'ROSE', 'FRONT', 'original', 'jpeg'),
      row(3, 'ANY', 'MACRO', 'original', 'jpeg'),
      row(4, 'ANY', 'SIZE_GUIDE', 'original', 'jpeg'),
      row(5, 'ANY', 'ANGLE', 'large', 'avif'), // no JPEG copy — left out
    ];
    assert.deepEqual(imageUrlsForColour(rows, 'ROSE'), [
      'https://cdn.example/2-original.jpeg',
      'https://cdn.example/3-original.jpeg',
    ]);
    assert.deepEqual(imageUrlsForColour(rows, 'YELLOW'), [
      'https://cdn.example/1-original.jpeg',
      'https://cdn.example/3-original.jpeg',
    ]);
  });
});
