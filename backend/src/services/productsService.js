import { slugify } from '../utils/slug.js';
import { NotFoundError } from '../utils/AppError.js';
import {
  listProducts as listProductsRow,
  findProductBySlug,
  findProductById,
  findProductImages,
  findProductSizes,
  createProduct as createProductRow,
  updateProduct as updateProductRow,
  deleteProduct as deleteProductRow,
} from '../repositories/products.repository.js';
import { replaceProductSizes } from '../repositories/productSizes.repository.js';
import {
  findProductVariantOptions,
  replaceGoldColors,
  replacePurityOptions,
  replaceDiamondOptions,
} from '../repositories/productVariantOptions.repository.js';
import {
  findCategoryBySlug,
  getCategoryAndDescendantIds,
} from '../repositories/categories.repository.js';
import { findCollectionBySlug } from '../repositories/collections.repository.js';
import { computeVariantPricing } from './pricingService.js';
import { invalidateProductPages } from './pageCacheInvalidation.js';

export async function resolveCategoryIds(categorySlug) {
  if (!categorySlug) return undefined;
  const category = await findCategoryBySlug(categorySlug);
  if (!category) return []; // unknown slug -> no matches, not an error
  return getCategoryAndDescendantIds(category.id);
}

async function resolveCollectionId(collectionSlug) {
  if (!collectionSlug) return undefined;
  const collection = await findCollectionBySlug(collectionSlug);
  return collection?.id ?? null; // null on unknown slug -> no matches
}

export async function listPublicProducts({
  categorySlug,
  collectionSlug,
  metalType,
  purity,
  goldColor,
  priceMin,
  priceMax,
  sort,
  page,
  limit,
}) {
  const categoryIds = await resolveCategoryIds(categorySlug);
  const collectionId = await resolveCollectionId(collectionSlug);
  if (collectionId === null || (categoryIds && categoryIds.length === 0)) {
    return { items: [], total: 0 };
  }

  return listProductsRow(
    { categoryIds, collectionId, metalType, purity, goldColor, priceMin, priceMax, status: 'PUBLISHED' },
    { sort, page, limit },
  );
}

export async function getPublicProductBySlug(slug) {
  const product = await findProductBySlug(slug);
  if (!product || product.status !== 'PUBLISHED') {
    throw new NotFoundError('Product not found');
  }
  const images = await findProductImages(product.id);
  const sizes = await findProductSizes(product.id);
  const variantOptions = await findProductVariantOptions(product.id);
  return { ...product, images, sizes, variantOptions };
}

export async function getRelatedProducts(slug, limit = 4) {
  const product = await findProductBySlug(slug);
  if (!product || product.status !== 'PUBLISHED') return [];
  const categoryIds = await getCategoryAndDescendantIds(product.category_id);
  const { items } = await listProductsRow(
    { categoryIds, status: 'PUBLISHED', excludeId: product.id },
    { sort: 'newest', page: 1, limit },
  );
  return items;
}

export function adminListProducts(filters, pagination) {
  return listProductsRow(filters, pagination);
}

export async function adminGetProduct(id) {
  const product = await findProductById(id);
  if (!product) throw new NotFoundError('Product not found');
  const images = await findProductImages(id);
  const sizes = await findProductSizes(id);
  const variantOptions = await findProductVariantOptions(id);
  return { ...product, images, sizes, variantOptions };
}

export async function adminCreateProduct(input) {
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);
  const { sizes: sizesInput, goldColors, purities, diamondConfigIds, ...fields } = input;
  let product = await createProductRow({ ...fields, slug, status: input.status ?? 'DRAFT' });
  if (sizesInput !== undefined) {
    await replaceProductSizes(product.id, sizesInput);
  }
  if (goldColors !== undefined) await replaceGoldColors(product.id, goldColors);
  if (purities !== undefined) await replacePurityOptions(product.id, purities);
  if (diamondConfigIds !== undefined) await replaceDiamondOptions(product.id, diamondConfigIds);
  if (sizesInput !== undefined) {
    // available_stock rolls up from sizes — re-fetch so the response (and
    // the invalidation payload) reflects the just-saved sizes, not the
    // pre-sizes snapshot returned by createProductRow.
    product = await findProductById(product.id);
  }
  await invalidateProductPages(product);
  const sizes = await findProductSizes(product.id);
  const variantOptions = await findProductVariantOptions(product.id);
  return { ...product, sizes, variantOptions };
}

export async function adminUpdateProduct(id, input) {
  const existing = await findProductById(id);
  if (!existing) throw new NotFoundError('Product not found');

  const { sizes: sizesInput, goldColors, purities, diamondConfigIds, ...fields } = input;
  if (Object.hasOwn(fields, 'slug') && fields.slug) {
    fields.slug = slugify(fields.slug);
  }
  let product = await updateProductRow(id, fields);
  if (sizesInput !== undefined) {
    await replaceProductSizes(id, sizesInput);
  }
  if (goldColors !== undefined) await replaceGoldColors(id, goldColors);
  if (purities !== undefined) await replacePurityOptions(id, purities);
  if (diamondConfigIds !== undefined) await replaceDiamondOptions(id, diamondConfigIds);
  if (sizesInput !== undefined) {
    product = await findProductById(id);
  }
  await invalidateProductPages(product, existing.category_id);
  const sizes = await findProductSizes(id);
  const variantOptions = await findProductVariantOptions(id);
  return { ...product, sizes, variantOptions };
}

// Public/customer-facing price preview for a purity/diamond-quality
// combination — reuses the same numeric engine as cart/checkout so the
// number shown while shopping always matches what gets charged.
export async function previewProductVariantPricing(id, { purity, diamondConfigId }) {
  const product = await findProductById(id);
  if (!product || product.status !== 'PUBLISHED') throw new NotFoundError('Product not found');

  const options = await findProductVariantOptions(id);
  if (purity && !options.purities.includes(purity)) {
    throw new NotFoundError('Selected purity is not available for this product');
  }
  if (diamondConfigId && !options.diamondOptions.some((d) => d.id === diamondConfigId)) {
    throw new NotFoundError('Selected diamond quality is not available for this product');
  }

  const pricing = await computeVariantPricing(product, { purity, diamondConfigId });
  const mrp = Number(product.mrp);
  const discountPercent =
    mrp && mrp > pricing.sellingPrice ? Math.round(((mrp - pricing.sellingPrice) / mrp) * 100) : 0;
  return { ...pricing, mrp, discountPercent };
}

export async function adminDeleteProduct(id) {
  const existing = await findProductById(id);
  if (!existing) throw new NotFoundError('Product not found');
  await deleteProductRow(id);
  await invalidateProductPages(existing);
}
