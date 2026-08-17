import { NotFoundError } from '../utils/AppError.js';
import { findProductById, findProductsByIds } from '../repositories/products.repository.js';
import {
  findWishlistByOwner,
  createWishlist,
  findWishlistItems,
  addWishlistItem,
  removeWishlistItem,
  reassignWishlistOwner,
  mergeGuestWishlistIntoUserWishlist,
} from '../repositories/wishlist.repository.js';

async function findOrCreateWishlist(owner) {
  const existing = await findWishlistByOwner(owner);
  if (existing) return existing;
  return createWishlist(owner);
}

function toItemDto(product) {
  return {
    productId: product.id,
    name: product.name,
    slug: product.slug,
    categorySlug: product.category_slug,
    primaryImageUrl: product.primary_image_url,
    sellingPrice: Number(product.selling_price),
    mrp: Number(product.mrp),
    availableStock: product.available_stock,
  };
}

export async function getWishlist(owner) {
  const wishlist = await findOrCreateWishlist(owner);
  const items = await findWishlistItems(wishlist.id);
  if (items.length === 0) return { items: [] };

  const products = await findProductsByIds(items.map((i) => i.product_id));
  const productMap = new Map(products.map((p) => [p.id, p]));

  const enriched = items
    .map((item) => productMap.get(item.product_id))
    .filter(Boolean)
    .map(toItemDto);

  return { items: enriched };
}

export async function addItem(owner, productId) {
  const product = await findProductById(productId);
  if (!product || product.status !== 'PUBLISHED') throw new NotFoundError('Product not found');

  const wishlist = await findOrCreateWishlist(owner);
  await addWishlistItem(wishlist.id, productId);
  return getWishlist(owner);
}

export async function removeItem(owner, productId) {
  const wishlist = await findOrCreateWishlist(owner);
  await removeWishlistItem(wishlist.id, productId);
  return getWishlist(owner);
}

// Mirrors cartService.mergeCartsOnLogin — same login-time fold, no
// quantities to reconcile here, just a set union of product_ids.
export async function mergeWishlistsOnLogin(guestSessionId, userId) {
  if (!guestSessionId) return;
  const guestWishlist = await findWishlistByOwner({ guestSessionId });
  if (!guestWishlist) return;

  const userWishlist = await findWishlistByOwner({ userId });
  if (!userWishlist) {
    await reassignWishlistOwner(guestWishlist.id, userId);
    return;
  }

  await mergeGuestWishlistIntoUserWishlist(guestWishlist.id, userWishlist.id);
}
