import { useEffect, useState } from 'react';
import type { ProductDetail, GoldColor, VariantPricePreview } from '../api/types';
import { fetchVariantPricePreview } from '../api/products';
import { effectiveMrp } from '../utils/effectiveMrp';
import { isColorAvailableAtPurity } from '../utils/goldColorRules';

const LOW_STOCK_THRESHOLD = 3;

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

  // Purity, Diamond Quality, and Size change price — live-recomputed from
  // the same engine cart/checkout use, so what's shown here (and what gets
  // added to cart) always matches what actually gets charged.
  useEffect(() => {
    setPricePreview(null);
    if (!product || (!selectedPurity && !selectedDiamondConfigId && !selectedSizeId)) return;
    let cancelled = false;
    fetchVariantPricePreview(product.id, {
      purity: selectedPurity,
      diamondConfigId: selectedDiamondConfigId,
      sizeId: selectedSizeId,
    })
      .then((result) => {
        if (!cancelled) setPricePreview(result);
      })
      .catch(() => {
        if (!cancelled) setPricePreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [product, selectedPurity, selectedDiamondConfigId, selectedSizeId]);

  // Purity/Diamond Quality/Gold Color default to whichever value the admin
  // themselves set as the product's own base configuration — not
  // automatically the cheapest configured option on that axis. Falls back
  // to cheapest-first only when the admin's own value isn't actually among
  // the configured options (data inconsistency, shouldn't normally happen).
  // Size has no equivalent "admin default" (sizes are just a stock catalog),
  // so it keeps defaulting to the smallest available size. Keyed on the
  // product id (not on the selections themselves) so this only runs once
  // per product load and never clobbers a shopper's own later choice.
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
      const defaultDiamond = adminDefault ?? [...product.diamondOptions].sort((a, b) => a.ratePerCent - b.ratePerCent)[0];
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

  // Some colors aren't manufactured at some purities (e.g. no Rose Gold at
  // 9K) — if the current pair ever becomes invalid, whether from the
  // default-selection effect above landing on a conflicting admin-set
  // default or the shopper switching purity while an unavailable color was
  // selected, fall back to another available color rather than leaving an
  // invalid combination silently selected.
  useEffect(() => {
    if (!product || !selectedGoldColor || !selectedPurity) return;
    if (isColorAvailableAtPurity(selectedGoldColor, selectedPurity)) return;
    const fallback = product.goldColorOptions.find((c) => isColorAvailableAtPurity(c, selectedPurity));
    if (fallback) setSelectedGoldColor(fallback);
  }, [selectedPurity, selectedGoldColor, product]);

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

  return {
    selectedSizeId,
    setSelectedSizeId,
    selectedGoldColor,
    setSelectedGoldColor,
    selectedPurity,
    setSelectedPurity,
    selectedDiamondConfigId,
    setSelectedDiamondConfigId,
    pricePreview,
    selectedSize,
    isOutOfStock,
    isLowStock,
    selectedDiamondOption,
    displayPrice,
    displayMrp,
    displaySellingPriceOriginal,
    displayGstAmount,
    displayOfferLabel,
    displayBreakup,
  };
}
