import { getEnabledSectionsWithItems } from '../repositories/homepage.repository.js';
import { toListDto, discountPercent, offerLabel } from './products.controller.js';
import { applyProductOffer } from '../services/pricingService.js';

function toItemDto(row) {
  let product = null;
  if (row.product_id) {
    const offer = applyProductOffer({
      goldValue: Number(row.product_gold_value),
      diamondValue: Number(row.product_diamond_value),
      makingCharge: Number(row.product_making_charge),
      gstPercent: Number(row.product_gst_percent),
      sellingPrice: Number(row.product_selling_price),
      makingChargeDiscountPercent: Number(row.product_making_charge_discount_percent ?? 0),
      diamondDiscountPercent: Number(row.product_diamond_discount_percent ?? 0),
    });
    product = {
      id: row.product_id,
      name: row.product_name,
      slug: row.product_slug,
      sellingPrice: offer.sellingPrice,
      sellingPriceOriginal: offer.sellingPriceOriginal,
      mrp: Number(row.product_mrp),
      discountPercent: discountPercent(Number(row.product_mrp), offer.sellingPrice),
      offerLabel: offerLabel(offer.makingChargeDiscountPercent, offer.diamondDiscountPercent),
      imageUrl: row.product_image_url,
      metalType: row.product_metal_type,
      purity: row.product_purity,
    };
  }

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
    product,
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
