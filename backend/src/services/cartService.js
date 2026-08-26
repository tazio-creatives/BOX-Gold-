import { AppError, NotFoundError } from '../utils/AppError.js';
import {
  findProductById,
  findProductsByIds,
  findProductSizes,
  findProductSizesByIds,
} from '../repositories/products.repository.js';
import { findProductVariantOptions } from '../repositories/productVariantOptions.repository.js';
import { findDiamondConfigsByIds } from '../repositories/diamondConfigs.repository.js';
import { computeVariantPricing } from './pricingService.js';
import { isColorAvailableAtPurity } from '../utils/goldColorRules.js';
import {
  findCartByOwner,
  createCart,
  findCartItems,
  upsertCartItemIncrement,
  setCartItemQuantity,
  removeCartItem,
  reassignCartOwner,
  mergeGuestCartIntoUserCart,
} from '../repositories/carts.repository.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Mirrors addCartItemSchema/updateCartItemSchema's per-request cap — that
// only bounds one request's delta, so a repeated increment (upsertCartItemIncrement
// adds onto the existing stored quantity) still needs its own ceiling.
const MAX_LINE_QUANTITY = 20;

async function findOrCreateCart(owner) {
  const existing = await findCartByOwner(owner);
  if (existing) return existing;
  return createCart(owner);
}

function toItemDto(item, product, size, pricing, diamondConfigName) {
  const sellingPrice = pricing.sellingPrice;
  const lineTotal = round2(sellingPrice * item.quantity);
  // Same split used at checkout (checkoutService.js) — the tax portion
  // already baked into selling_price, backed out per line so the cart can
  // show a real GST-exclusive subtotal without guessing a flat rate.
  const lineGoldValue = round2(pricing.goldValue * item.quantity);
  const lineDiamondValue = round2(pricing.diamondValue * item.quantity);
  const lineMakingCharge = round2(pricing.makingCharge * item.quantity);
  const lineGst = round2(lineTotal - lineGoldValue - lineDiamondValue - lineMakingCharge);
  // A sized line's real availability is the size's own stock, not the
  // product-level rollup.
  const availableStock = size ? size.available_stock : product.available_stock;
  return {
    productId: product.id,
    name: product.name,
    slug: product.slug,
    categorySlug: product.category_slug,
    primaryImageUrl: product.primary_image_url,
    metalType: product.metal_type,
    purity: pricing.purity,
    goldColor: item.gold_color ?? product.gold_color,
    productSize: product.product_size,
    sizeId: size ? size.id : null,
    sizeLabel: size ? size.label : null,
    diamondConfigId: pricing.diamondConfigId,
    // Raw cart_items values (often null for products with no configurable
    // variant), as opposed to the pricing-defaulted fields above — mutations
    // (remove/update quantity) must send these back, not the defaulted
    // display values, since carts.repository.js matches against the actual
    // stored row and a defaulted-but-not-actually-set value matches nothing.
    cartGoldColor: item.gold_color,
    cartPurity: item.purity,
    cartDiamondConfigId: item.diamond_config_id,
    diamondConfigName: diamondConfigName ?? null,
    sellingPrice,
    // Display-only — same pre-offer figure PDP/PLP/home already expose
    // (computeVariantPricing -> applyProductOffer), so the cart row can
    // show a "was" price without duplicating the discount math here.
    sellingPriceOriginal: pricing.sellingPriceOriginal,
    mrp: product.mrp != null ? Number(product.mrp) : 0,
    availableStock,
    quantity: item.quantity,
    lineTotal,
    lineGst,
    // Display-time truth only — stock can move between add-to-cart and
    // checkout, and this doesn't block anything either way: a line that
    // exceeds availableStock is fulfilled as Make to Order (checkoutService)
    // rather than rejected.
    isBackordered: item.quantity > availableStock,
  };
}

export async function getCart(owner) {
  const cart = await findOrCreateCart(owner);
  const items = await findCartItems(cart.id);
  if (items.length === 0) return { items: [], subtotal: 0, gstAmount: 0, itemCount: 0 };

  const products = await findProductsByIds(items.map((i) => i.product_id));
  const productMap = new Map(products.map((p) => [p.id, p]));

  const sizeIds = items.map((i) => i.product_size_id).filter(Boolean);
  const sizes = await findProductSizesByIds(sizeIds);
  const sizeMap = new Map(sizes.map((s) => [s.id, s]));

  const diamondConfigIds = [
    ...new Set(items.map((i) => i.diamond_config_id).filter(Boolean)),
  ];
  const diamondConfigs = await findDiamondConfigsByIds(diamondConfigIds);
  const diamondConfigMap = new Map(diamondConfigs.map((d) => [d.id, d.name]));

  const enriched = (
    await Promise.all(
      items.map(async (item) => {
        const product = productMap.get(item.product_id);
        if (!product) return null;
        const size = item.product_size_id ? sizeMap.get(item.product_size_id) : null;
        const pricing = await computeVariantPricing(product, {
          purity: item.purity,
          diamondConfigId: item.diamond_config_id,
          sizeWeightGrams: size?.weight_grams != null ? Number(size.weight_grams) : null,
          sizeDiamondWeightCarats:
            size?.diamond_weight_carats != null ? Number(size.diamond_weight_carats) : null,
        });
        const diamondConfigName = pricing.diamondConfigId
          ? (diamondConfigMap.get(pricing.diamondConfigId) ?? null)
          : null;
        return toItemDto(item, product, size, pricing, diamondConfigName);
      }),
    )
  ).filter(Boolean);

  const subtotal = round2(enriched.reduce((sum, i) => sum + i.lineTotal, 0));
  const gstAmount = round2(enriched.reduce((sum, i) => sum + i.lineGst, 0));
  const itemCount = enriched.reduce((sum, i) => sum + i.quantity, 0);

  return {
    items: enriched.map(({ lineGst, ...rest }) => rest),
    subtotal,
    gstAmount,
    itemCount,
  };
}

export async function addItem(owner, { productId, quantity, sizeId, goldColor, purity, diamondConfigId }) {
  const product = await findProductById(productId);
  if (!product || product.status !== 'PUBLISHED') throw new NotFoundError('Product not found');

  const sizes = await findProductSizes(productId);
  if (sizes.length > 0 && !sizeId) {
    throw new AppError(400, 'Please select a size');
  }
  let size = null;
  if (sizeId) {
    size = sizes.find((s) => s.id === sizeId);
    if (!size) throw new AppError(400, 'Selected size is not available for this product');
  }

  const options = await findProductVariantOptions(productId);
  if (options.goldColors.length > 0 && !goldColor) {
    throw new AppError(400, 'Please select a gold color');
  }
  if (goldColor && !options.goldColors.includes(goldColor)) {
    throw new AppError(400, 'Selected gold color is not available for this product');
  }
  if (options.purities.length > 0 && !purity) {
    throw new AppError(400, 'Please select a purity');
  }
  if (purity && !options.purities.includes(purity)) {
    throw new AppError(400, 'Selected purity is not available for this product');
  }
  if (goldColor && purity && !isColorAvailableAtPurity(goldColor, purity)) {
    throw new AppError(400, `Selected gold color is not available in ${purity} purity`);
  }
  if (options.diamondOptions.length > 0 && !diamondConfigId) {
    throw new AppError(400, 'Please select a diamond quality');
  }
  if (diamondConfigId && !options.diamondOptions.some((d) => d.id === diamondConfigId)) {
    throw new AppError(400, 'Selected diamond quality is not available for this product');
  }

  // Out-of-stock no longer blocks adding to cart — it becomes Make to
  // Order, enforced/flagged for display in toItemDto and at checkout
  // (checkoutService), not here. Still capped at a fixed ceiling (not
  // availableStock) so repeated increments can't grow a line unbounded.
  const cart = await findOrCreateCart(owner);
  const variant = { sizeId: sizeId ?? null, goldColor: goldColor ?? null, purity: purity ?? null, diamondConfigId: diamondConfigId ?? null };
  let item = await upsertCartItemIncrement(cart.id, productId, variant, quantity);
  if (item.quantity > MAX_LINE_QUANTITY) {
    item = await setCartItemQuantity(cart.id, productId, variant, MAX_LINE_QUANTITY);
  }
  return getCart(owner);
}

export async function updateItemQuantity(owner, productId, variant, quantity) {
  const cart = await findOrCreateCart(owner);
  if (quantity <= 0) {
    await removeCartItem(cart.id, productId, variant);
    return getCart(owner);
  }

  if (variant?.sizeId) {
    const sizes = await findProductSizes(productId);
    if (!sizes.some((s) => s.id === variant.sizeId)) throw new NotFoundError('Product not found');
  } else {
    const product = await findProductById(productId);
    if (!product) throw new NotFoundError('Product not found');
  }

  const updated = await setCartItemQuantity(cart.id, productId, variant, quantity);
  if (!updated) throw new NotFoundError('Item not in cart');
  return getCart(owner);
}

export async function removeItem(owner, productId, variant) {
  const cart = await findOrCreateCart(owner);
  await removeCartItem(cart.id, productId, variant);
  return getCart(owner);
}

// Fired from the OTP verify LOGIN/SIGNUP path (plan §11) — folds whatever
// was in the guest cart_session cookie's cart into the now-identified
// user's cart, deduping by product_id (and every variant axis).
export async function mergeCartsOnLogin(guestSessionId, userId) {
  if (!guestSessionId) return;
  const guestCart = await findCartByOwner({ guestSessionId });
  if (!guestCart) return;

  const userCart = await findCartByOwner({ userId });
  if (!userCart) {
    await reassignCartOwner(guestCart.id, userId);
    return;
  }

  await mergeGuestCartIntoUserCart(guestCart.id, userCart.id);
}
