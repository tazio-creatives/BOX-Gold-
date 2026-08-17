import { getEnabledSectionsWithItems } from '../repositories/homepage.repository.js';
import { toListDto } from './products.controller.js';

function toItemDto(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    imageUrlMobile: row.image_url_mobile,
    heading: row.heading,
    subheading: row.subheading,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    category: row.category_id
      ? { id: row.category_id, name: row.category_name, slug: row.category_slug, imageUrl: row.category_image_url }
      : null,
    collection: row.collection_id
      ? { id: row.collection_id, name: row.collection_name, slug: row.collection_slug }
      : null,
    product: row.product_id
      ? {
          id: row.product_id,
          name: row.product_name,
          slug: row.product_slug,
          sellingPrice: Number(row.product_selling_price),
          imageUrl: row.product_image_url,
          metalType: row.product_metal_type,
          purity: row.product_purity,
        }
      : null,
    products: (row.products ?? []).map(toListDto),
  };
}

export async function get(req, res, next) {
  try {
    const sections = await getEnabledSectionsWithItems();
    res.json({
      sections: sections.map((s) => ({
        id: s.id,
        type: s.type,
        heading: s.heading,
        items: s.items.map(toItemDto),
      })),
    });
  } catch (err) {
    next(err);
  }
}
