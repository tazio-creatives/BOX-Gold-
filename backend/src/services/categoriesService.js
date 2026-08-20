import { slugify } from '../utils/slug.js';
import { AppError, NotFoundError } from '../utils/AppError.js';
import {
  listAllCategories,
  findCategoryBySlug,
  findCategoryById,
  isSelfOrDescendant,
  createCategory as createCategoryRow,
  updateCategory as updateCategoryRow,
  deleteCategory as deleteCategoryRow,
  countProductsInCategory,
  countChildCategories,
} from '../repositories/categories.repository.js';
import { invalidateCategoryPages } from './pageCacheInvalidation.js';

export function listCategories(options) {
  return listAllCategories(options);
}

export async function getCategoryBySlugOrThrow(slug) {
  const category = await findCategoryBySlug(slug);
  if (!category) throw new NotFoundError('Category not found');
  return category;
}

async function assertValidParent(parentId, { selfId } = {}) {
  if (!parentId) return;
  if (parentId === selfId) {
    throw new AppError(400, 'A category cannot be its own parent');
  }
  const parent = await findCategoryById(parentId);
  if (!parent) throw new AppError(400, 'parentId does not reference an existing category');
  if (selfId && (await isSelfOrDescendant(selfId, parentId))) {
    throw new AppError(400, 'That parent would create a category cycle');
  }
}

export async function createCategory(input) {
  await assertValidParent(input.parentId);
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);
  const category = await createCategoryRow({ ...input, slug });
  await invalidateCategoryPages(category);
  return category;
}

export async function updateCategory(id, input) {
  const existing = await findCategoryById(id);
  if (!existing) throw new NotFoundError('Category not found');

  if (Object.hasOwn(input, 'parentId')) {
    await assertValidParent(input.parentId, { selfId: id });
  }
  const fields = { ...input };
  if (Object.hasOwn(input, 'slug') && input.slug) {
    fields.slug = slugify(input.slug);
  }
  const category = await updateCategoryRow(id, fields);
  await invalidateCategoryPages(category, existing.slug);
  return category;
}

export async function deleteCategory(id) {
  const existing = await findCategoryById(id);
  if (!existing) throw new NotFoundError('Category not found');

  // products.category_id is ON DELETE RESTRICT, so an unchecked delete fails
  // with a generic FK-violation 409 that doesn't say why. Check up front and
  // give the admin an actionable message instead.
  const productCount = await countProductsInCategory(id);
  if (productCount > 0) {
    throw new AppError(
      409,
      `Cannot delete "${existing.name}": ${productCount} product${productCount === 1 ? ' is' : 's are'} still assigned to this category. Reassign or delete them first.`,
    );
  }

  const childCount = await countChildCategories(id);
  if (childCount > 0) {
    throw new AppError(
      409,
      `Cannot delete "${existing.name}": it has ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'}. Delete or move them first.`,
    );
  }

  await deleteCategoryRow(id);
  await invalidateCategoryPages(existing);
}
