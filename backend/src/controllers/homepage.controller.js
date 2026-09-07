import { getEnabledSectionsWithItems } from '../repositories/homepage.repository.js';
import { toListDto, rowOffer, discountPercent, offerLabel, strikePriceInfo } from './products.controller.js';

// Homepage's hand-curated queries (NEW_ARRIVALS/FEATURED_PRODUCT/the single
// linked-item join, see homepage.repository.js) select the same pricing
// columns as everywhere else, just prefixed `product_*` to sit alongside the
// item's own columns in one row — reshaped back to the plain names rowOffer
// expects so this goes through the exact same purity-rule-aware discount
// resolution as the PLP/search/wishlist, instead of re-deriving the offer
// from the flat columns only.
function toItemDto(row) {
  let product = null;
  if (row.product_id) {
    const offer = rowOffer({
      gold_value: row.product_gold_value,
      diamond_value: row.product_diamond_value,
      making_charge: row.product_making_charge,
      gst_percent: row.product_gst_percent,
      selling_price: row.product_selling_price,
      making_charge_discount_percent: row.product_making_charge_discount_percent,
      diamond_discount_percent: row.product_diamond_discount_percent,
      effective_making_charge_discount_percent: row.product_effective_making_charge_discount_percent,
      effective_diamond_discount_percent: row.product_effective_diamond_discount_percent,
    });
    const priceInfo = strikePriceInfo(Number(row.product_mrp), offer.sellingPrice, offer.sellingPriceOriginal);
    product = {
      id: row.product_id,
      name: row.product_name,
      slug: row.product_slug,
      sellingPrice: offer.sellingPrice,
      sellingPriceOriginal: offer.sellingPriceOriginal,
      mrp: Number(row.product_mrp),
      discountPercent: discountPercent(Number(row.product_mrp), offer.sellingPrice),
      strikePrice: priceInfo.strikePrice,
      hasDiscount: priceInfo.hasDiscount,
      effectiveDiscountPercent: priceInfo.effectiveDiscountPercent,
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
