import { useEffect, useState } from 'react';
import type { ProductDetail, GoldColor, VariantPricePreview } from '../api/types';
import { fetchVariantPricePreview } from '../api/products';
import { effectiveMrp } from '../utils/effectiveMrp';

const LOW_STOCK_THRESHOLD = 3;

function findAttributeValueId(
  product: ProductDetail,
  code: string,
  matches: (v: { value: string; refId: string | null }) => boolean,
): string | null {
  return product.attributes.find((a) => a.code === code)?.values.find(matches)?.id ?? null;
}

// Resolves a {goldColor, purity, diamondConfigId, sizeId} selection to a
// real product_variants row — every axis the product actually has configured
// must be selected for a match to exist (variants are exact combinations,
// not independently-priceable axes the way the old model was). Returns null
// while the selection is still incomplete or doesn't correspond to any real
// (offered) combination.
function resolveVariantId(
  product: ProductDetail,
  selection: {
    goldColor: GoldColor | null;
    purity: string | null;
    diamondConfigId: string | null;
    sizeId: string | null;
  },
): string | null {
  const requiredIds: string[] = [];
  if (selection.goldColor) {
    const id = findAttributeValueId(product, 'gold_color', (v) => v.value === selection.goldColor);
    if (!id) return null;
    requiredIds.push(id);
  }
  if (selection.purity) {
    const id = findAttributeValueId(product, 'purity', (v) => v.value === selection.purity);
    if (!id) return null;
    requiredIds.push(id);
  }
  if (selection.diamondConfigId) {
    const id = findAttributeValueId(product, 'diamond_quality', (v) => v.refId === selection.diamondConfigId);
    if (!id) return null;
    requiredIds.push(id);
  }
  // sizeId is already an attribute_value id (see products.controller.js's
  // `sizes` derived field — its `id` is the size attribute_value's own id).
  if (selection.sizeId) requiredIds.push(selection.sizeId);

  const sortedRequired = [...requiredIds].sort();
  const match = product.variants.find((v) => {
    if (!v.isAvailable) return false;
    const sortedActual = [...v.attributeValueIds].sort();
    return sortedActual.length === sortedRequired.length && sortedActual.every((id, i) => id === sortedRequired[i]);
  });
  return match?.id ?? null;
}

// True if some currently-*available* variant carries every one of the given
// attribute_value ids together — the shared engine behind every pairwise
// compatibility check below. Checking v.isAvailable here is what actually
// makes an admin's Availability Rule (or a manual per-variant exclusion)
// take effect on the storefront: a combination can have a real variant row
// and still not be offered.
function isCombinationAvailable(product: ProductDetail, ids: string[]): boolean {
  if (ids.length === 0) return true;
  return product.variants.some((v) => v.isAvailable && ids.every((id) => v.attributeValueIds.includes(id)));
}

// A color is "available at this purity" for this product if at least one
// real, currently-offered (available) combination pairs them — replaces the
// old universal hardcoded rule (9K has no Rose Gold, for every product) with
// per-product truth driven by whatever variants actually exist, including
// admin-defined Availability Rules.
function colorAvailableAtPurity(product: ProductDetail, color: GoldColor, purity: string | null | undefined): boolean {
  const colorId = findAttributeValueId(product, 'gold_color', (v) => v.value === color);
  if (!colorId) return true; // axis not configured at all — nothing to conflict with
  const purityId = purity ? findAttributeValueId(product, 'purity', (v) => v.value === purity) : null;
  return isCombinationAvailable(product, purityId ? [colorId, purityId] : [colorId]);
}

// Same idea for Diamond Quality vs. Purity — the pairing an Availability
// Rule most commonly targets (e.g. "GH isn't available in 18K").
function diamondAvailableAtPurity(
  product: ProductDetail,
  diamondConfigId: string,
  purity: string | null | undefined,
): boolean {
  const diamondId = findAttributeValueId(product, 'diamond_quality', (v) => v.refId === diamondConfigId);
  if (!diamondId) return true;
  const purityId = purity ? findAttributeValueId(product, 'purity', (v) => v.value === purity) : null;
  return isCombinationAvailable(product, purityId ? [diamondId, purityId] : [diamondId]);
}

// And Purity itself, checked against whatever's already selected on the
// other two axes — keeps the relationship symmetric so a purity that would
// break the shopper's existing color/diamond choice is disabled too, not
// just auto-corrected after the fact.
function purityAvailable(
  product: ProductDetail,
  purity: string,
  selectedGoldColor: GoldColor | null,
  selectedDiamondConfigId: string | null,
): boolean {
  const purityId = findAttributeValueId(product, 'purity', (v) => v.value === purity);
  if (!purityId) return true;
  const ids = [purityId];
  if (selectedGoldColor) {
    const colorId = findAttributeValueId(product, 'gold_color', (v) => v.value === selectedGoldColor);
    if (colorId) ids.push(colorId);
  }
  if (selectedDiamondConfigId) {
    const diamondId = findAttributeValueId(product, 'diamond_quality', (v) => v.refId === selectedDiamondConfigId);
    if (diamondId) ids.push(diamondId);
  }
  return isCombinationAvailable(product, ids);
}

// Owns gold color / purity / diamond quality / size selection, live
// price-preview recompute, and admin-default selection for any surface that
// needs to add a variant product to cart — originally inline in PDPPage.tsx,
// extracted so the PLP quick-add sheet can share the exact same
// defaulting/validation behavior instead of re-implementing it.
export function useVariantSelection(product: ProductDetail | undefined) {
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [selectedGoldColor, setSelectedGoldColor] = useState<GoldColor | null>(null);
  const [selectedPurity, setSelectedPurity] = useState<string | null>(null);
  const [selectedDiamondConfigId, setSelectedDiamondConfigId] = useState<string | null>(null);
  const [pricePreview, setPricePreview] = useState<VariantPricePreview | null>(null);

  // A different product's variant choices never carry over — reset them
  // whenever the caller switches to a new product.
  useEffect(() => {
    setSelectedSizeId(null);
    setSelectedGoldColor(null);
    setSelectedPurity(null);
    setSelectedDiamondConfigId(null);
    setPricePreview(null);
  }, [product]);

  const selectedVariantId = product
    ? resolveVariantId(product, {
        goldColor: selectedGoldColor,
        purity: selectedPurity,
        diamondConfigId: selectedDiamondConfigId,
        sizeId: selectedSizeId,
      })
    : null;

  // Only a fully-resolved, real combination can be priced — live-recomputed
  // from the same engine cart/checkout use, so what's shown here (and what
  // gets added to cart) always matches what actually gets charged. While
  // the selection is still incomplete, displayPrice below falls back to the
  // product's own (already "cheapest available variant") base price.
  useEffect(() => {
    setPricePreview(null);
    if (!product || !selectedVariantId) return;
    let cancelled = false;
    fetchVariantPricePreview(product.id, { variantId: selectedVariantId })
      .then((result) => {
        if (!cancelled) setPricePreview(result);
      })
      .catch(() => {
        if (!cancelled) setPricePreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [product, selectedVariantId]);

  // Purity/Diamond Quality/Gold Color default to whichever value the admin
  // themselves set as the product's own base configuration — not
  // automatically the cheapest configured option on that axis. Falls back
  // to the first configured option only when the admin's own value isn't
  // actually among the configured options (data inconsistency, shouldn't
  // normally happen). Size has no equivalent "admin default" (sizes are
  // just a stock catalog), so it keeps defaulting to the smallest available
  // size. Keyed on the product id (not on the selections themselves) so
  // this only runs once per product load and never clobbers a shopper's own
  // later choice.
  useEffect(() => {
    if (!product) return;
    if (product.purityOptions.length > 0) {
      const defaultPurity =
        product.purity && product.purityOptions.includes(product.purity)
          ? product.purity
          : [...product.purityOptions].sort((a, b) => parseInt(a, 10) - parseInt(b, 10))[0];
      setSelectedPurity(defaultPurity);
    }
    if (product.diamondOptions.length > 0) {
      const adminDefault = product.diamondConfigId
        ? product.diamondOptions.find((d) => d.id === product.diamondConfigId)
        : undefined;
      const defaultDiamond = adminDefault ?? product.diamondOptions[0];
      setSelectedDiamondConfigId(defaultDiamond.id);
    }
    if (product.goldColorOptions.length > 0) {
      const defaultColor =
        product.goldColor && product.goldColorOptions.includes(product.goldColor)
          ? product.goldColor
          : product.goldColorOptions.includes('YELLOW')
            ? 'YELLOW'
            : product.goldColorOptions[0];
      setSelectedGoldColor(defaultColor);
    }
    if (product.sizes.length > 0) {
      const smallestSize = [...product.sizes].sort((a, b) => {
        const na = parseInt(a.label, 10);
        const nb = parseInt(b.label, 10);
        if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
        return na - nb;
      })[0];
      setSelectedSizeId(smallestSize.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Some colors aren't manufactured at some purities — if the current pair
  // ever becomes invalid, whether from the default-selection effect above
  // landing on a conflicting admin-set default or the shopper switching
  // purity while an unavailable color was selected, fall back to another
  // available color rather than leaving an invalid combination silently
  // selected. Driven by this product's real variants, not a hardcoded rule.
  useEffect(() => {
    if (!product || !selectedGoldColor || !selectedPurity) return;
    if (colorAvailableAtPurity(product, selectedGoldColor, selectedPurity)) return;
    const fallback = product.goldColorOptions.find((c) => colorAvailableAtPurity(product, c, selectedPurity));
    if (fallback) setSelectedGoldColor(fallback);
  }, [selectedPurity, selectedGoldColor, product]);

  // Same idea for Diamond Quality — an Availability Rule (e.g. "GH isn't
  // available in 18K") can make the currently-selected diamond quality
  // invalid the moment purity changes; fall back to another available one
  // rather than silently letting an unavailable combination stay selected.
  useEffect(() => {
    if (!product || !selectedDiamondConfigId || !selectedPurity) return;
    if (diamondAvailableAtPurity(product, selectedDiamondConfigId, selectedPurity)) return;
    const fallback = product.diamondOptions.find((d) => diamondAvailableAtPurity(product, d.id, selectedPurity));
    if (fallback) setSelectedDiamondConfigId(fallback.id);
  }, [selectedPurity, selectedDiamondConfigId, product]);

  const selectedSize = product?.sizes.find((s) => s.id === selectedSizeId) ?? null;
  // A product-level rollup is wrong once a specific size is picked — a
  // product with some in-stock and some out-of-stock sizes must reflect the
  // *selected* size's own stock, not the whole product's availableStock.
  const isOutOfStock = product
    ? product.sizes.length > 0
      ? selectedSize
        ? selectedSize.availableStock <= 0
        : false
      : product.availableStock <= 0
    : false;
  const isLowStock = product ? !isOutOfStock && product.availableStock <= LOW_STOCK_THRESHOLD : false;

  const selectedDiamondOption = product?.diamondOptions.find((d) => d.id === selectedDiamondConfigId) ?? null;
  const displayPrice = pricePreview?.sellingPrice ?? product?.sellingPrice ?? 0;
  const displaySellingPriceOriginal = pricePreview?.sellingPriceOriginal ?? product?.sellingPriceOriginal ?? 0;
  const { strikePrice: displayMrp } = effectiveMrp(displayPrice, pricePreview?.mrp ?? product?.mrp ?? 0, displaySellingPriceOriginal);
  const displayGstAmount = pricePreview?.gstAmount ?? product?.priceBreakup.gstAmount ?? 0;
  const displayOfferLabel = pricePreview?.offerLabel ?? product?.offerLabel ?? null;

  // The live-resolved gold weight for whatever combination is selected (may
  // differ from the product's own base weight — see Weight Defaults, a
  // purity or purity+size rule can give a combination a different physical
  // weight). Net Weight mirrors Gold Weight exactly for these gold-only
  // products (see ProductFormPage's "Net Weight = Gold Weight only" note);
  // Gross Weight adds the diamond's own weight in grams, which never varies
  // by combination (no per-variant/rule mechanism exists for it), so that
  // component always comes from the product's own base value.
  const displayGoldWeightGrams = pricePreview?.goldWeightGrams ?? product?.goldWeightGrams ?? null;
  const displayDiamondWeightCarats = pricePreview?.diamondWeightCarats ?? product?.diamondWeightCarats ?? null;
  const displayNetWeightGrams = displayGoldWeightGrams;
  const displayGrossWeightGrams =
    displayGoldWeightGrams != null ? displayGoldWeightGrams + (product?.diamondWeightGrams ?? 0) : null;
  const displayBreakup = pricePreview
    ? {
        goldValue: pricePreview.goldValue,
        diamondValue: pricePreview.diamondValue,
        diamondValueOriginal: pricePreview.diamondValueOriginal,
        makingCharge: pricePreview.makingCharge,
        makingChargeOriginal: pricePreview.makingChargeOriginal,
        makingChargeDiscountPercent: pricePreview.makingChargeDiscountPercent,
        diamondDiscountPercent: pricePreview.diamondDiscountPercent,
        gstAmount: pricePreview.gstAmount,
        total: pricePreview.sellingPrice,
      }
    : product?.priceBreakup;

  // Bound to this product so ColorSelector/PillSelector (generic, no
  // product reference) can check real per-product combination validity
  // without importing a hardcoded rule.
  const isColorAvailableAtPurity = (color: GoldColor, purity: string | null | undefined) =>
    !product ? true : colorAvailableAtPurity(product, color, purity);
  const isDiamondAvailableAtPurity = (diamondConfigId: string) =>
    !product ? true : diamondAvailableAtPurity(product, diamondConfigId, selectedPurity);
  const isPurityAvailable = (purity: string) =>
    !product ? true : purityAvailable(product, purity, selectedGoldColor, selectedDiamondConfigId);

  return {
    selectedSizeId,
    setSelectedSizeId,
    selectedGoldColor,
    setSelectedGoldColor,
    isColorAvailableAtPurity,
    selectedPurity,
    setSelectedPurity,
    isPurityAvailable,
    selectedDiamondConfigId,
    setSelectedDiamondConfigId,
    isDiamondAvailableAtPurity,
    selectedVariantId,
    pricePreview,
    selectedSize,
    isOutOfStock,
    isLowStock,
    selectedDiamondOption,
    displayGoldWeightGrams,
    displayDiamondWeightCarats,
    displayNetWeightGrams,
    displayGrossWeightGrams,
    displayPrice,
    displayMrp,
    displaySellingPriceOriginal,
    displayGstAmount,
    displayOfferLabel,
    displayBreakup,
  };
}
