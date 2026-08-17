import {
  createSectionSchema,
  updateSectionSchema,
  reorderSchema,
  createItemSchema,
  updateItemSchema,
} from '../validators/homepage.validators.js';
import {
  listAllSections,
  findSectionById,
  findMaxSectionSortOrder,
  insertSection,
  updateSection as updateSectionRow,
  deleteSection as deleteSectionRow,
  updateSectionSortOrder,
  findItemsBySectionId,
  findItemById,
  findMaxItemSortOrder,
  insertItem,
  updateItem as updateItemRow,
  deleteItem as deleteItemRow,
  updateItemSortOrder,
} from '../repositories/homepageAdmin.repository.js';
import { invalidatePageCache } from '../repositories/pageCache.repository.js';
import { processAndStoreHomepageImage } from '../services/homepageImageService.js';
import { AppError, NotFoundError } from '../utils/AppError.js';

const invalidateHome = () => invalidatePageCache(['/']);

function toSectionDto(section, items = []) {
  return {
    id: section.id,
    type: section.type,
    heading: section.heading,
    isEnabled: section.is_enabled,
    sortOrder: section.sort_order,
    items: items.map(toItemDto),
  };
}

function toItemDto(item) {
  return {
    id: item.id,
    imageUrl: item.image_url,
    imageUrlMobile: item.image_url_mobile,
    heading: item.heading,
    subheading: item.subheading,
    ctaLabel: item.cta_label,
    ctaUrl: item.cta_url,
    categoryId: item.category_id,
    collectionId: item.collection_id,
    productId: item.product_id,
    sortOrder: item.sort_order,
  };
}

export async function list(req, res, next) {
  try {
    const sections = await listAllSections();
    const withItems = await Promise.all(
      sections.map(async (section) => toSectionDto(section, await findItemsBySectionId(section.id))),
    );
    res.json({ sections: withItems });
  } catch (err) {
    next(err);
  }
}

export async function createSection(req, res, next) {
  try {
    const input = createSectionSchema.parse(req.body);
    const sortOrder = (await findMaxSectionSortOrder()) + 1;
    const section = await insertSection({ ...input, sortOrder });
    await invalidateHome();
    res.status(201).json({ section: toSectionDto(section) });
  } catch (err) {
    next(err);
  }
}

export async function updateSection(req, res, next) {
  try {
    const input = updateSectionSchema.parse(req.body);
    const existing = await findSectionById(req.params.id);
    if (!existing) throw new NotFoundError('Section not found');
    const section = await updateSectionRow(req.params.id, input);
    const items = await findItemsBySectionId(section.id);
    await invalidateHome();
    res.json({ section: toSectionDto(section, items) });
  } catch (err) {
    next(err);
  }
}

export async function deleteSection(req, res, next) {
  try {
    const existing = await findSectionById(req.params.id);
    if (!existing) throw new NotFoundError('Section not found');
    await deleteSectionRow(req.params.id);
    await invalidateHome();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Two-phase remap through a temporary offset range — see
// productImages.controller.js's reorder() for why a naive single-pass
// remap of an arbitrary permutation can transiently collide two rows.
export async function reorderSections(req, res, next) {
  try {
    const { order } = reorderSchema.parse(req.body);
    for (let i = 0; i < order.length; i++) {
      await updateSectionSortOrder(order[i], -1000 - i);
    }
    for (let i = 0; i < order.length; i++) {
      await updateSectionSortOrder(-1000 - i, i);
    }
    await invalidateHome();
    const sections = await listAllSections();
    res.json({ sections: sections.map((s) => toSectionDto(s)) });
  } catch (err) {
    next(err);
  }
}

export async function uploadImage(req, res, next) {
  try {
    if (!req.file) throw new AppError(400, 'No image file provided');
    const { url } = await processAndStoreHomepageImage(req.file.buffer);
    res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
}

export async function createItem(req, res, next) {
  try {
    const sectionId = req.params.id;
    const section = await findSectionById(sectionId);
    if (!section) throw new NotFoundError('Section not found');

    const input = createItemSchema.parse(req.body);
    const sortOrder = (await findMaxItemSortOrder(sectionId)) + 1;
    const item = await insertItem({ ...input, sectionId, sortOrder });
    await invalidateHome();
    res.status(201).json({ item: toItemDto(item) });
  } catch (err) {
    next(err);
  }
}

export async function updateItem(req, res, next) {
  try {
    const existing = await findItemById(req.params.id);
    if (!existing) throw new NotFoundError('Item not found');
    const input = updateItemSchema.parse(req.body);
    const item = await updateItemRow(req.params.id, input);
    await invalidateHome();
    res.json({ item: toItemDto(item) });
  } catch (err) {
    next(err);
  }
}

export async function deleteItem(req, res, next) {
  try {
    const existing = await findItemById(req.params.id);
    if (!existing) throw new NotFoundError('Item not found');
    await deleteItemRow(req.params.id);
    await invalidateHome();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function reorderItems(req, res, next) {
  try {
    const sectionId = req.params.id;
    const section = await findSectionById(sectionId);
    if (!section) throw new NotFoundError('Section not found');

    const { order } = reorderSchema.parse(req.body);
    for (let i = 0; i < order.length; i++) {
      await updateItemSortOrder(sectionId, order[i], -1000 - i);
    }
    for (let i = 0; i < order.length; i++) {
      await updateItemSortOrder(sectionId, -1000 - i, i);
    }
    await invalidateHome();
    const items = await findItemsBySectionId(sectionId);
    res.json({ items: items.map(toItemDto) });
  } catch (err) {
    next(err);
  }
}
