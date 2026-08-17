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
    diamondConfigName: diamondConfigName ?? null,
    sellingPrice,
    availableStock,
    quantity: item.quantity,
    lineTotal,
    lineGst,
    // Display-time truth only — stock can move between add-to-cart and
    // checkout; the real enforcement is the FOR UPDATE reservation at
    // checkout (plan §11), not here.
    isAvailable: availableStock > 0 && item.quantity <= availableStock,
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
  if (options.diamondOptions.length > 0 && !diamondConfigId) {
    throw new AppError(400, 'Please select a diamond quality');
  }
  if (diamondConfigId && !options.diamondOptions.some((d) => d.id === diamondConfigId)) {
    throw new AppError(400, 'Selected diamond quality is not available for this product');
  }

  const availableStock = size ? size.available_stock : product.available_stock;
  if (availableStock <= 0) throw new AppError(400, 'This item is out of stock');

  const cart = await findOrCreateCart(owner);
  const variant = { sizeId: sizeId ?? null, goldColor: goldColor ?? null, purity: purity ?? null, diamondConfigId: diamondConfigId ?? null };
  const requested = Math.min(quantity, availableStock);
  let item = await upsertCartItemIncrement(cart.id, productId, variant, requested);
  if (item.quantity > availableStock) {
    item = await setCartItemQuantity(cart.id, productId, variant, availableStock);
  }
  return getCart(owner);
}

export async function updateItemQuantity(owner, productId, variant, quantity) {
  const cart = await findOrCreateCart(owner);
  if (quantity <= 0) {
    await removeCartItem(cart.id, productId, variant);
    return getCart(owner);
  }

  let availableStock;
  if (variant?.sizeId) {
    const sizes = await findProductSizes(productId);
    const size = sizes.find((s) => s.id === variant.sizeId);
    if (!size) throw new NotFoundError('Product not found');
    availableStock = size.available_stock;
  } else {
    const product = await findProductById(productId);
    if (!product) throw new NotFoundError('Product not found');
    availableStock = product.available_stock;
  }
  const clamped = Math.min(quantity, Math.max(availableStock, 0));
  if (clamped <= 0) throw new AppError(400, 'This item is out of stock');

  const updated = await setCartItemQuantity(cart.id, productId, variant, clamped);
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
