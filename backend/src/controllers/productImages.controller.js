import { reorderImagesSchema } from '../validators/productImages.validators.js';
import { processAndStoreImage } from '../services/imageProcessingService.js';
import { storageProvider } from '../providers/storage/index.js';
import { keyFromUrl } from '../utils/storageKey.js';
import { AppError, NotFoundError } from '../utils/AppError.js';
import { findProductById, findProductImages } from '../repositories/products.repository.js';
import {
  countProductImages,
  insertProductImage,
  clearPrimaryForProduct,
  setPrimaryBySortOrder,
  updateSortOrder,
  deleteProductImagesBySortOrder,
  findMaxSortOrder,
} from '../repositories/productImages.repository.js';
function groupImages(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.sort_order)) {
      groups.set(row.sort_order, {
        sortOrder: row.sort_order,
        type: row.type,
        isPrimary: row.is_primary,
        variants: [],
      });
    }
    groups.get(row.sort_order).variants.push({ variant: row.variant, format: row.format, url: row.url });
  }
  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function list(req, res, next) {
  try {
    const rows = await findProductImages(req.params.id);
    res.json({ images: groupImages(rows) });
  } catch (err) {
    next(err);
  }
}

// Admin uploads a photo directly — this is a plain manual upload, entirely
// independent of the "Generate with AI" flow (that's a separate, explicit
// action via the AI Image Studio). Manual uploads never trigger AI
// generation on their own.
export async function uploadOriginal(req, res, next) {
  try {
    if (!req.file) throw new AppError(400, 'No image file provided');

    const productId = req.params.id;
    const product = await findProductById(productId);
    if (!product) throw new NotFoundError('Product not found');

    const variants = await processAndStoreImage(productId, req.file.buffer);
    const isFirstImage = (await countProductImages(productId, 'ORIGINAL')) === 0;
    const sortOrder = (await findMaxSortOrder(productId)) + 1;

    for (const v of variants) {
      await insertProductImage({
        productId,
        type: 'ORIGINAL',
        variant: v.variant,
        format: v.format,
        url: v.url,
        sortOrder,
      });
    }
    if (isFirstImage) {
      await clearPrimaryForProduct(productId);
      await setPrimaryBySortOrder(productId, sortOrder);
    }

    const rows = await findProductImages(productId);
    res.status(201).json({ images: groupImages(rows) });
  } catch (err) {
    next(err);
  }
}

export async function setPrimary(req, res, next) {
  try {
    const productId = req.params.id;
    const sortOrder = Number(req.params.sortOrder);
    await clearPrimaryForProduct(productId);
    await setPrimaryBySortOrder(productId, sortOrder);
    const rows = await findProductImages(productId);
    res.json({ images: groupImages(rows) });
  } catch (err) {
    next(err);
  }
}

// Two-phase remap through a temporary offset range — sort_order has no
// uniqueness constraint, but a naive single-pass remap can still transiently
// collide two groups onto the same value and clobber one of them if the
// requested permutation isn't already sorted.
export async function reorder(req, res, next) {
  try {
    const productId = req.params.id;
    const { order } = reorderImagesSchema.parse(req.body);

    for (let i = 0; i < order.length; i++) {
      await updateSortOrder(productId, order[i], -1000 - i);
    }
    for (let i = 0; i < order.length; i++) {
      await updateSortOrder(productId, -1000 - i, i);
    }

    const rows = await findProductImages(productId);
    res.json({ images: groupImages(rows) });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const productId = req.params.id;
    const sortOrder = Number(req.params.sortOrder);
    const deleted = await deleteProductImagesBySortOrder(productId, sortOrder);
    // Best-effort — a missing file on disk shouldn't block the DB cleanup
    // the admin actually asked for.
    await Promise.allSettled(
      deleted.map((row) => {
        return storageProvider.delete(keyFromUrl(row.url));
      }),
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
