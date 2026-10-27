// Loads every published product the way the storefront PDP sees it and
// turns it into catalogue products for the Meta feed (metaCatalogFeed.js):
// one entry per purity × gold colour the product actually offers, priced
// by the PDP's own price-preview function so the feed price always equals
// the page price (Meta rejects items whose prices differ).
import {
  listPublicProducts,
  getPublicProductBySlug,
  previewProductVariantPricing,
} from './productsService.js';
import { selectGroupForColour } from './productImageResolver.js';
import { listAllCategories } from '../repositories/categories.repository.js';
import { toDetailDto, strikePriceInfo } from '../controllers/products.controller.js';

const PAGE_SIZE = 100;
const CONCURRENCY = 4;

// ---------------------------------------------------------------------------
// Variant selection — mirrors web/src/hooks/useVariantSelection.ts, which
// decides what the product page opens on. Kept identical on purpose: the
// feed must price exactly the variant a shopper lands on from Instagram.
// Change both together.
// ---------------------------------------------------------------------------

function findAttributeValueId(product, code, matches) {
  return product.attributes.find((a) => a.code === code)?.values.find(matches)?.id ?? null;
}

export function resolveVariantId(product, selection) {
  const requiredIds = [];
  if (selection.goldColor) {
    const id = findAttributeValueId(product, 'gold_color', (v) => v.value === selection.goldColor);
    if (!id) return null;
    requiredIds.push(id);
  }
  if (selection.purity) {
    const id = findAttributeValueId(product, 'purity', (v) => v.value === selection.purity);
    if (!id) return null;
    requiredIds.push(id);
  }
  if (selection.diamondConfigId) {
    const id = findAttributeValueId(
      product,
      'diamond_quality',
      (v) => v.refId === selection.diamondConfigId,
    );
    if (!id) return null;
    requiredIds.push(id);
  }
  if (selection.sizeId) requiredIds.push(selection.sizeId);

  const sortedRequired = [...requiredIds].sort();
  const match = product.variants.find((v) => {
    if (!v.isAvailable) return false;
    const sortedActual = [...v.attributeValueIds].sort();
    return (
      sortedActual.length === sortedRequired.length &&
      sortedActual.every((id, i) => id === sortedRequired[i])
    );
  });
  return match?.id ?? null;
}

function isCombinationAvailable(product, ids) {
  if (ids.length === 0) return true;
  return product.variants.some(
    (v) => v.isAvailable && ids.every((id) => v.attributeValueIds.includes(id)),
  );
}

export function colorAvailableAtPurity(product, color, purity) {
  const colorId = findAttributeValueId(product, 'gold_color', (v) => v.value === color);
  if (!colorId) return true;
  const purityId = purity
    ? findAttributeValueId(product, 'purity', (v) => v.value === purity)
    : null;
  return isCombinationAvailable(product, purityId ? [colorId, purityId] : [colorId]);
}

function diamondAvailableAtPurity(product, diamondConfigId, purity) {
  const diamondId = findAttributeValueId(
    product,
    'diamond_quality',
    (v) => v.refId === diamondConfigId,
  );
  if (!diamondId) return true;
  const purityId = purity
    ? findAttributeValueId(product, 'purity', (v) => v.value === purity)
    : null;
  return isCombinationAvailable(product, purityId ? [diamondId, purityId] : [diamondId]);
}

export function getDefaultSelection(product) {
  const purity =
    product.purityOptions.length > 0
      ? product.purity && product.purityOptions.includes(product.purity)
        ? product.purity
        : [...product.purityOptions].sort((a, b) => parseInt(a, 10) - parseInt(b, 10))[0]
      : null;

  let diamondConfigId = null;
  if (product.diamondOptions.length > 0) {
    const adminDefault = product.diamondConfigId
      ? product.diamondOptions.find((d) => d.id === product.diamondConfigId)
      : undefined;
    diamondConfigId = (adminDefault ?? product.diamondOptions[0]).id;
  }

  let goldColor = null;
  if (product.goldColorOptions.length > 0) {
    goldColor =
      product.goldColor && product.goldColorOptions.includes(product.goldColor)
        ? product.goldColor
        : product.goldColorOptions.includes('YELLOW')
          ? 'YELLOW'
          : product.goldColorOptions[0];
  }

  let sizeId = null;
  if (product.sizes.length > 0) {
    sizeId = [...product.sizes].sort((a, b) => {
      const na = parseInt(a.label, 10);
      const nb = parseInt(b.label, 10);
      if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
      return na - nb;
    })[0].id;
  }

  if (goldColor && purity && !colorAvailableAtPurity(product, goldColor, purity)) {
    goldColor =
      product.goldColorOptions.find((c) => colorAvailableAtPurity(product, c, purity)) ?? goldColor;
  }
  if (diamondConfigId && purity && !diamondAvailableAtPurity(product, diamondConfigId, purity)) {
    diamondConfigId =
      product.diamondOptions.find((d) => diamondAvailableAtPurity(product, d.id, purity))?.id ??
      diamondConfigId;
  }

  return { goldColor, purity, diamondConfigId, sizeId };
}

// The selection the PDP lands on for a feed link (?purity=&colour=): the
// default selection with that purity and colour, then the hook's own
// diamond-quality fallback for the chosen purity. Diamond quality and size
// stay on the page's defaults.
export function selectionFor(product, { purity, goldColor }) {
  const selection = { ...getDefaultSelection(product), purity, goldColor };
  if (
    selection.diamondConfigId &&
    purity &&
    !diamondAvailableAtPurity(product, selection.diamondConfigId, purity)
  ) {
    const fallback = product.diamondOptions.find((d) =>
      diamondAvailableAtPurity(product, d.id, purity),
    );
    if (fallback) selection.diamondConfigId = fallback.id;
  }
  return selection;
}

// ---------------------------------------------------------------------------
// Photos — Meta takes JPEG/PNG only; every uploaded photo keeps a JPEG copy
// ("original" variant, imageProcessingService.js) next to its AVIF/WebP.
// ---------------------------------------------------------------------------

function originalJpegUrl(group) {
  return group.rows.find((r) => r.variant === 'original' && r.format === 'jpeg')?.url ?? null;
}

// Main photo by the same per-colour rule the cart and checkout use, then
// the rest of that colour's (and colour-neutral) catalogue photos.
export function imageUrlsForColour(imageRows, goldColour) {
  const main = selectGroupForColour(imageRows, goldColour);
  const groups = new Map();
  for (const row of imageRows) {
    if (!groups.has(row.sort_order)) {
      groups.set(row.sort_order, {
        sortOrder: row.sort_order,
        type: row.type,
        goldColour: row.gold_colour ?? 'ANY',
        shotType: row.shot_type ?? 'OTHER',
        rows: [],
      });
    }
    groups.get(row.sort_order).rows.push(row);
  }
  const others = [...groups.values()]
    .filter(
      (g) =>
        g.sortOrder !== main?.sortOrder &&
        g.type !== 'PRODUCT_SIZE' &&
        g.shotType !== 'SIZE_GUIDE' &&
        (!goldColour || g.goldColour === goldColour || g.goldColour === 'ANY'),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return [main, ...others].filter(Boolean).map(originalJpegUrl).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Categories → jewellery type / audience
// ---------------------------------------------------------------------------

// Same mapping as web/src/seo/productSeo.ts's jewelleryType().
const JEWELLERY_TYPES = {
  rings: 'Ring',
  ring: 'Ring',
  earrings: 'Earrings',
  earring: 'Earrings',
  necklaces: 'Necklace',
  necklace: 'Necklace',
  pendants: 'Pendant',
  pendant: 'Pendant',
  bangles: 'Bangle',
  bangle: 'Bangle',
  bracelets: 'Bracelet',
  bracelet: 'Bracelet',
};

function categoryChain(categoriesById, categoryId) {
  const chain = [];
  let current = categoriesById.get(categoryId);
  while (current && !chain.includes(current)) {
    chain.unshift(current);
    current = current.parent_id ? categoriesById.get(current.parent_id) : null;
  }
  return chain; // root first
}

function audience(chain) {
  const names = chain.map((c) => c.name).join(' ');
  return {
    gender: /\b(gents|men|mens|men's)\b/i.test(names) ? 'male' : 'female',
    ageGroup: /\bkids?\b/i.test(names) ? 'kids' : 'adult',
  };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

async function listAllPublishedRows() {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const { items, total } = await listPublicProducts({ sort: 'newest', page, limit: PAGE_SIZE });
    rows.push(...items);
    if (items.length === 0 || page * PAGE_SIZE >= total) break;
  }
  return rows;
}

async function toCatalogProduct(listRow, categoriesById) {
  const raw = await getPublicProductBySlug(listRow.slug);
  const product = toDetailDto(raw);
  const chain = categoryChain(categoriesById, product.categoryId);

  const catalogProduct = {
    id: product.id,
    sku: product.sku,
    name: product.name,
    path: listRow.category_slug ? `/${listRow.category_slug}/${product.slug}` : null,
    description: product.shortDescription || product.fullDescription || '',
    type: JEWELLERY_TYPES[chain[0]?.name.trim().toLowerCase()] ?? null,
    ...audience(chain),
    hasDiamonds: !!(
      product.diamondColour ||
      product.diamondClarity ||
      (product.diamondWeightCarats ?? 0) > 0
    ),
    diamondCount: product.diamondCount ?? 0,
    certification: product.certification?.trim() || null,
    variants: [],
    skipReasons: [],
  };

  const purities = product.purityOptions.length > 0 ? product.purityOptions : [null];
  const colours = product.goldColorOptions.length > 0 ? product.goldColorOptions : [null];
  for (const purity of purities) {
    for (const goldColor of colours) {
      // Colours never made at this purity simply aren't offered — not a problem to report.
      if (goldColor && purity && !colorAvailableAtPurity(product, goldColor, purity)) continue;

      const selection = selectionFor(product, { purity, goldColor });
      const variantId = resolveVariantId(product, selection);
      if (!variantId && product.variants.length > 0) {
        const label = [purity, goldColor].filter(Boolean).join(' ') || 'default';
        catalogProduct.skipReasons.push(
          `${label}: no available variant for the page's default diamond quality/size`,
        );
        continue;
      }

      const pricing = await previewProductVariantPricing(product.id, { variantId });
      const { strikePrice } = strikePriceInfo(
        pricing.mrp,
        pricing.sellingPrice,
        pricing.sellingPriceOriginal,
      );
      catalogProduct.variants.push({
        purity,
        goldColor,
        diamondQuality:
          product.diamondOptions.find((d) => d.id === selection.diamondConfigId)?.name ?? null,
        diamondCarats: Number(pricing.diamondWeightCarats ?? product.diamondWeightCarats ?? 0),
        sellingPrice: pricing.sellingPrice,
        strikePrice,
        imageUrls: imageUrlsForColour(raw.images ?? [], goldColor),
      });
    }
  }
  return catalogProduct;
}

// Every published, priced product (the same set the listing pages show).
// A product that fails to load is reported, never allowed to break the feed.
export async function getCatalogProducts() {
  const [rows, categories] = await Promise.all([listAllPublishedRows(), listAllCategories()]);
  const categoriesById = new Map(categories.map((c) => [c.id, c]));

  // Filled by index so the feed keeps the listing order (newest first)
  // whatever order the workers finish in.
  const products = new Array(rows.length);
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const index = next;
      next += 1;
      const row = rows[index];
      try {
        products[index] = await toCatalogProduct(row, categoriesById);
      } catch (err) {
        products[index] = {
          id: row.id,
          sku: row.sku,
          name: row.name,
          variants: [],
          skipReasons: [`failed to load: ${err.message}`],
        };
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return products;
}
