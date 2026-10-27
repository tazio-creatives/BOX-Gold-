// Meta (Facebook + Instagram) catalogue feed — turns catalogue products
// (built by metaCatalogService.js) into feed items, one per purity × gold
// colour, rendered as RSS 2.0 XML, which Meta Commerce Manager reads as a
// scheduled data feed. Pure: no database, no network.
//
// IDs: item_group_id is the product's SKU (or id), exactly the content_id
// the storefront's Meta Pixel already sends (web/src/analytics/metaPixel.ts),
// so Pixel activity matches the catalogue without changing what it tracks.

export const BRAND = 'BOX DIAMONDS';

// Meta's Google-taxonomy categories, keyed by the singular jewellery type the
// storefront derives from the top-level category (web/src/seo/productSeo.ts).
const CATEGORY = {
  Ring: 'Apparel & Accessories > Jewelry > Rings',
  Earrings: 'Apparel & Accessories > Jewelry > Earrings',
  Necklace: 'Apparel & Accessories > Jewelry > Necklaces',
  Pendant: 'Apparel & Accessories > Jewelry > Charms & Pendants',
  Bracelet: 'Apparel & Accessories > Jewelry > Bracelets',
  Bangle: 'Apparel & Accessories > Jewelry > Bracelets',
};
const DEFAULT_CATEGORY = 'Apparel & Accessories > Jewelry';

const MAX_ID_LENGTH = 100; // Meta's limit for id / item_group_id

const slug = (value) =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const money = (inr) => `${inr.toFixed(2)} INR`;

const plainText = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function priceBand(inr) {
  if (inr < 5000) return 'under-5k';
  if (inr < 10000) return '5k-10k';
  if (inr < 20000) return '10k-20k';
  if (inr < 30000) return '20k-30k';
  return '30k-plus';
}

// One id per product — what the Pixel sends as content_ids today.
export function feedGroupId(product) {
  return String(product.sku || product.id);
}

// One id per listed variant: "<SKU>-18k-rose". A product with no purity or
// colour options at all gets "<SKU>-1", so an item id never equals its
// group id.
export function feedItemId(product, variant) {
  const parts = [variant.purity, variant.goldColor].filter(Boolean).map(slug);
  const id = `${feedGroupId(product)}-${parts.length ? parts.join('-') : '1'}`;
  if (id.length > MAX_ID_LENGTH)
    throw new Error(`catalogue id longer than ${MAX_ID_LENGTH} characters`);
  return id;
}

// The product page opening on this exact purity/colour (Phase 4 of the
// Instagram plan makes the PDP read these). Diamond quality and size are
// left to the page's own defaults — the same ones the feed priced.
export function variantUrl(siteUrl, product, variant) {
  const url = new URL(product.path, siteUrl);
  if (variant.purity) url.searchParams.set('purity', variant.purity);
  if (variant.goldColor) url.searchParams.set('colour', variant.goldColor.toLowerCase());
  return url.toString();
}

function metalLabel(variant) {
  return [variant.purity, variant.goldColor && capitalise(variant.goldColor), 'Gold']
    .filter(Boolean)
    .join(' ');
}

function title(product, variant) {
  const metal = variant.purity || variant.goldColor ? `, ${metalLabel(variant)}` : '';
  return `${product.name}${metal}`.slice(0, 150);
}

// Only facts from the product's own data — no claims the product page
// doesn't make itself.
function describe(product, variant) {
  const specs = [];
  if (product.hasDiamonds) {
    const stones =
      product.diamondCount > 0
        ? `${product.diamondCount} natural diamond${product.diamondCount === 1 ? '' : 's'}`
        : 'natural diamonds';
    const details = [
      variant.diamondCarats > 0 ? `${Number(variant.diamondCarats.toFixed(3))} ct total` : null,
      variant.diamondQuality,
    ].filter(Boolean);
    specs.push(`Set with ${stones}${details.length ? ` (${details.join(', ')})` : ''}.`);
  }
  if (product.certification) {
    // Admins often type the whole phrase ("IGI Certified") — don't add the word twice.
    specs.push(
      /certif/i.test(product.certification)
        ? `${product.certification}.`
        : `${product.certification} certified.`,
    );
  }
  if (variant.purity || variant.goldColor) {
    specs.push(
      `Crafted in ${[variant.purity, variant.goldColor?.toLowerCase(), 'gold'].filter(Boolean).join(' ')}.`,
    );
  }

  let body = plainText(product.description);
  if (body && !/[.!?]$/.test(body)) body += '.';
  const text = [body, ...specs].filter(Boolean).join(' ');
  return (text || product.name).slice(0, 5000);
}

// Data the product page shows that would look wrong to Meta's reviewers —
// listed in the health report, never fixed or hidden by the feed itself.
function dataWarnings(product) {
  const warnings = [];
  if (product.certification && /[,/&]/.test(product.certification)) {
    warnings.push(`certification lists several labs: "${product.certification}"`);
  }
  if (!product.type)
    warnings.push('top-level category is not a jewellery type (feed uses generic "Jewelry")');
  return warnings;
}

// products: from metaCatalogService.getCatalogProducts(). Returns the feed
// items plus everything left out (skipped) or worth a look (warnings).
export function buildFeedItems(products, { siteUrl }) {
  const items = [];
  const skipped = [];
  const warnings = [];
  const seen = new Set();

  for (const product of products) {
    const productRef = `${product.sku || product.id} ${product.name ?? ''}`.trim();
    for (const reason of product.skipReasons ?? []) skipped.push({ ref: productRef, reason });
    if (product.variants.length === 0 && product.skipReasons?.length) continue;
    if (!product.name?.trim()) {
      skipped.push({ ref: productRef, reason: 'missing name' });
      continue;
    }
    if (!product.path?.startsWith('/')) {
      skipped.push({ ref: productRef, reason: 'no product page URL (no category assigned)' });
      continue;
    }
    for (const warning of dataWarnings(product)) warnings.push({ ref: productRef, warning });

    for (const variant of product.variants) {
      const ref = [productRef, variant.purity, variant.goldColor].filter(Boolean).join(' ');
      let id;
      try {
        id = feedItemId(product, variant);
      } catch (err) {
        skipped.push({ ref, reason: err.message });
        continue;
      }
      if (seen.has(id)) {
        skipped.push({ ref, reason: `duplicate id ${id}` });
        continue;
      }
      if (!Number.isFinite(variant.sellingPrice) || variant.sellingPrice <= 0) {
        skipped.push({ ref, reason: 'price missing or zero' });
        continue;
      }
      if (variant.imageUrls.length === 0) {
        skipped.push({ ref, reason: 'no JPEG photo (original upload) for this gold colour' });
        continue;
      }

      seen.add(id);
      const hasSale = variant.strikePrice > variant.sellingPrice;
      const item = {
        id,
        item_group_id: feedGroupId(product),
        title: title(product, variant),
        description: describe(product, variant),
        // Matches the product page's structured data: zero-stock pieces are
        // still orderable as Make to Order, so every published piece is
        // "in stock" (web/src/seo/jsonLd.ts).
        availability: 'in stock',
        condition: 'new',
        price: money(hasSale ? variant.strikePrice : variant.sellingPrice),
        link: variantUrl(siteUrl, product, variant),
        image_link: variant.imageUrls[0],
        brand: BRAND,
        google_product_category: CATEGORY[product.type] ?? DEFAULT_CATEGORY,
        gender: product.gender,
        age_group: product.ageGroup,
        custom_label_0: priceBand(variant.sellingPrice),
        custom_label_2: slug(product.type ?? 'jewellery'),
      };
      if (variant.goldColor) item.color = `${capitalise(variant.goldColor)} Gold`;
      if (variant.purity || variant.goldColor) {
        item.material = [metalLabel(variant), product.hasDiamonds ? 'Diamond' : null]
          .filter(Boolean)
          .join(', ');
      }
      if (variant.purity) item.custom_label_1 = variant.purity;
      if (variant.diamondQuality) item.custom_label_3 = variant.diamondQuality;
      if (variant.imageUrls.length > 1)
        item.additional_image_link = variant.imageUrls.slice(1, 11).join(',');
      if (hasSale) item.sale_price = money(variant.sellingPrice);
      items.push(item);
    }
  }
  return { items, skipped, warnings };
}

const xmlEscape = (s) =>
  String(s)
    // characters XML 1.0 does not allow
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function renderFeedXml(items, { siteUrl }) {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
    '<channel>',
    `<title>${xmlEscape(BRAND)}</title>`,
    `<link>${xmlEscape(siteUrl)}</link>`,
    `<description>${xmlEscape(`${BRAND} product catalogue`)}</description>`,
  ];
  for (const item of items) {
    out.push('<item>');
    for (const [field, value] of Object.entries(item)) {
      out.push(`<g:${field}>${xmlEscape(value)}</g:${field}>`);
    }
    out.push('</item>');
  }
  out.push('</channel>', '</rss>', '');
  return out.join('\n');
}
