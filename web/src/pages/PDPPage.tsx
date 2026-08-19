import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchProductBySlug, fetchRelatedProducts, fetchVariantPricePreview } from '../api/products';
import { fetchCategories } from '../api/categories';
import { addCartItem } from '../api/cart';
import type { Cart, GoldColor, VariantPricePreview } from '../api/types';
import { getAncestorChain } from '../utils/categoryTree';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useHead, defaultHead } from '../seo/head';
import { breadcrumbJsonLd, organizationJsonLd, productJsonLd } from '../seo/jsonLd';
import { ImageGallery } from '../features/pdp/ImageGallery';
import { ProductInfo } from '../features/pdp/ProductInfo';
import { PriceBreakupTable } from '../features/pdp/PriceBreakupTable';
import { AttributesList } from '../features/pdp/AttributesList';
import { DetailsCard } from '../features/pdp/DetailsCard';
import { ProductTabs } from '../features/pdp/ProductTabs';
import { RelatedProducts } from '../features/pdp/RelatedProducts';
import styles from './PDPPage.module.css';
import placeholderStyles from './PlaceholderPage.module.css';

const LOW_STOCK_THRESHOLD = 3;

export function PDPPage() {
  const { productSlug } = useParams<{ categorySlug: string; productSlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [justAdded, setJustAdded] = useState(false);
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [selectedGoldColor, setSelectedGoldColor] = useState<GoldColor | null>(null);
  const [selectedPurity, setSelectedPurity] = useState<string | null>(null);
  const [selectedDiamondConfigId, setSelectedDiamondConfigId] = useState<string | null>(null);
  const [pricePreview, setPricePreview] = useState<VariantPricePreview | null>(null);

  const {
    data: productData,
    isLoading: isProductLoading,
    isError: isProductError,
  } = useQuery({
    queryKey: ['product', productSlug],
    queryFn: () => fetchProductBySlug(productSlug as string),
    enabled: !!productSlug,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  const { data: relatedData } = useQuery({
    queryKey: ['related-products', productSlug],
    queryFn: () => fetchRelatedProducts(productSlug as string),
    enabled: !!productSlug,
  });

  // A different product's variant choices never carry over — reset them
  // whenever the shopper navigates to a new PDP.
  useEffect(() => {
    setSelectedSizeId(null);
    setSelectedGoldColor(null);
    setSelectedPurity(null);
    setSelectedDiamondConfigId(null);
    setPricePreview(null);
  }, [productSlug]);

  // Purity and Diamond Quality change price — live-recomputed from the same
  // engine cart/checkout use, so what's shown here (and what Buy Now
  // carries into checkout) always matches what actually gets charged.
  useEffect(() => {
    setPricePreview(null);
    if (!productData?.product || (!selectedPurity && !selectedDiamondConfigId)) return;
    let cancelled = false;
    fetchVariantPricePreview(productData.product.id, {
      purity: selectedPurity,
      diamondConfigId: selectedDiamondConfigId,
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
  }, [productData?.product, selectedPurity, selectedDiamondConfigId]);

  // Price should always show the lowest available option first, so default
  // Purity/Diamond Quality to their cheapest configured value the moment a
  // product with those axes loads — gold color has no price impact and
  // isn't defaulted, size still requires a deliberate pick. Keyed on the
  // product id (not on the selections themselves) so this only runs once
  // per product load and never clobbers a shopper's own later choice.
  useEffect(() => {
    const p = productData?.product;
    if (!p) return;
    if (p.purityOptions.length > 0) {
      const cheapestPurity = [...p.purityOptions].sort(
        (a, b) => parseInt(a, 10) - parseInt(b, 10),
      )[0];
      setSelectedPurity(cheapestPurity);
    }
    if (p.diamondOptions.length > 0) {
      const cheapestDiamond = [...p.diamondOptions].sort((a, b) => a.ratePerCent - b.ratePerCent)[0];
      setSelectedDiamondConfigId(cheapestDiamond.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productData?.product?.id]);

  const addToCartMutation = useMutation({
    mutationFn: ({
      productId,
      sizeId,
      goldColor,
      purity,
      diamondConfigId,
    }: {
      productId: string;
      sizeId?: string | null;
      goldColor?: string | null;
      purity?: string | null;
      diamondConfigId?: string | null;
    }) => addCartItem(productId, 1, { sizeId, goldColor, purity, diamondConfigId }),
    onSuccess: (cart: Cart) => {
      queryClient.setQueryData(['cart'], cart);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2000);
    },
  });

  const product = productData?.product;
  const categories = categoriesData?.categories ?? [];
  const category = product ? (categories.find((c) => c.id === product.categoryId) ?? null) : null;
  const ancestors = category ? getAncestorChain(categories, category) : [];

  const breadcrumbs: { label: string; href?: string }[] = product
    ? [...ancestors.map((c) => ({ label: c.name, href: `/${c.slug}` })), { label: product.name }]
    : [];

  const canonicalPath = product
    ? category
      ? `/${category.slug}/${product.slug}`
      : `/${product.slug}`
    : defaultHead.canonicalPath;

  // Called unconditionally (rules of hooks) — falls back to defaultHead
  // until the product query resolves, then reflects the real product.
  useHead(
    product
      ? {
          title: product.metaTitle ?? `${product.name} | BOX DIAMONDS`,
          description: product.metaDescription ?? product.shortDescription ?? product.name,
          canonicalPath,
          jsonLd: [
            organizationJsonLd(),
            breadcrumbJsonLd([{ name: 'Home', path: '/' }, ...breadcrumbs.map((b) => ({ name: b.label, path: b.href ?? canonicalPath }))]),
            productJsonLd(product, canonicalPath),
          ],
        }
      : defaultHead,
  );

  if (isProductLoading) {
    return (
      <div className={styles.page} aria-busy="true">
        <div className={styles.hero}>
          <div className={styles.skeletonCrumb} />

          <div className={styles.layout}>
            <div className={styles.skeletonImage} />
            <div className={styles.skeletonInfo}>
              <div className={styles.skeletonLine} style={{ width: '80%', height: 32 }} />
              <div className={styles.skeletonLine} style={{ width: '40%' }} />
              <div className={styles.skeletonLine} style={{ width: '55%', height: 28 }} />
              <div className={styles.skeletonLine} style={{ width: '90%' }} />
              <div className={styles.skeletonLine} style={{ width: '70%' }} />
              <div className={styles.skeletonLine} style={{ width: '100%', height: 54 }} />
            </div>
          </div>

          <div className={styles.detailsGrid}>
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
          </div>
        </div>

        <div className={styles.skeletonTabs} />
        <div className={styles.skeletonTrust} />
      </div>
    );
  }

  if (isProductError || !productData || !product) {
    return (
      <div className={placeholderStyles.container}>
        <h1 className={placeholderStyles.heading}>Product not found</h1>
        <p className={placeholderStyles.body}>We couldn't find that piece.</p>
      </div>
    );
  }

  const isOutOfStock = product.availableStock <= 0;
  const isLowStock = !isOutOfStock && product.availableStock <= LOW_STOCK_THRESHOLD;

  const selectedSize = product.sizes.find((s) => s.id === selectedSizeId) ?? null;
  const selectedDiamondOption = product.diamondOptions.find((d) => d.id === selectedDiamondConfigId) ?? null;
  const displayPrice = pricePreview?.sellingPrice ?? product.sellingPrice;
  const displayMrp = pricePreview?.mrp ?? product.mrp;
  const displayDiscount = pricePreview?.discountPercent ?? product.discountPercent;
  const displayGstAmount = pricePreview?.gstAmount ?? product.priceBreakup.gstAmount;

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <Breadcrumbs items={breadcrumbs} />

        <div className={styles.layout}>
          <ImageGallery
            images={product.images}
            productName={product.name}
            productId={product.id}
            isNew={product.isNew}
          />

          <ProductInfo
            product={product}
            isOutOfStock={isOutOfStock}
            isLowStock={isLowStock}
            justAdded={justAdded}
            isAddingToCart={addToCartMutation.isPending}
            selectedSizeId={selectedSizeId}
            onSelectSize={setSelectedSizeId}
            selectedGoldColor={selectedGoldColor}
            onSelectGoldColor={setSelectedGoldColor}
            selectedPurity={selectedPurity}
            onSelectPurity={setSelectedPurity}
            selectedDiamondConfigId={selectedDiamondConfigId}
            onSelectDiamondConfigId={setSelectedDiamondConfigId}
            displayPrice={displayPrice}
            displayMrp={displayMrp}
            displayDiscount={displayDiscount}
            onAddToCart={() =>
              addToCartMutation.mutate({
                productId: product.id,
                sizeId: selectedSizeId ?? undefined,
                goldColor: selectedGoldColor ?? undefined,
                purity: selectedPurity ?? undefined,
                diamondConfigId: selectedDiamondConfigId ?? undefined,
              })
            }
            onBuyNow={() =>
              navigate('/checkout', {
                state: {
                  buyNow: {
                    productId: product.id,
                    quantity: 1,
                    name: product.name,
                    slug: product.slug,
                    categorySlug: category?.slug ?? null,
                    sellingPrice: displayPrice,
                    gstAmount: displayGstAmount,
                    primaryImageUrl:
                      product.images.find((img) => img.isPrimary && img.variant === 'small')?.url ?? null,
                    availableStock: product.availableStock,
                    sizeId: selectedSize?.id ?? null,
                    sizeLabel: selectedSize?.label ?? null,
                    goldColor: selectedGoldColor ?? null,
                    purity: selectedPurity ?? null,
                    diamondConfigId: selectedDiamondConfigId ?? null,
                    diamondConfigName: selectedDiamondOption?.name ?? null,
                  },
                },
              })
            }
          />
        </div>

        <div className={styles.detailsGrid}>
          <DetailsCard title="Product Details" className={styles.detailsCardHeading}>
            <AttributesList product={product} />
          </DetailsCard>

          <DetailsCard title="Price Breakup" className={styles.detailsCardHeading}>
            <PriceBreakupTable breakup={product.priceBreakup} metalType={product.metalType} />
          </DetailsCard>
        </div>
      </div>

      <ProductTabs product={product} />

      <RelatedProducts products={relatedData?.products ?? []} categorySlug={category?.slug ?? null} />
    </div>
  );
}
