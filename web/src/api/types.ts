// Server-computed 8-10 calendar-day window from calculateDeliveryEstimate()
// (backend/src/services/deliveryEstimateService.js) — the frontend only
// formats these ISO dates (see utils/deliveryEstimate.ts), it never derives
// its own delivery-duration rule.
export interface DeliveryEstimate {
  minimumDays: number;
  maximumDays: number;
  earliestDate: string;
  latestDate: string;
  timezone: string;
}

export interface ProductCard {
  id: string;
  slug: string;
  categorySlug: string | null;
  name: string;
  metalType: 'GOLD' | 'PLATINUM';
  purity: string | null;
  goldColor: GoldColor | null;
  diamondColour: string | null;
  diamondClarity: string | null;
  sellingPrice: number;
  sellingPriceOriginal: number;
  mrp: number;
  discountPercent: number;
  // Server-resolved badge/strikethrough info — the higher of MRP and the
  // purity-rule-aware sellingPriceOriginal, already compared against
  // sellingPrice, so card components never need to re-derive it.
  strikePrice: number;
  hasDiscount: boolean;
  effectiveDiscountPercent: number;
  makingChargeDiscountPercent: number;
  diamondDiscountPercent: number;
  offerLabel: string | null;
  primaryImageUrl: string | null;
  availableStock: number;
  ratingAvg: number;
  ratingCount: number;
  isNew: boolean;
  deliveryEstimate: DeliveryEstimate | null;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
}

export interface CollectionRef {
  id: string;
  name: string;
  slug: string;
}

export interface HomepageItem {
  id: string;
  imageUrl: string | null;
  imageUrlMobile: string | null;
  heading: string | null;
  subheading: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  category: CategoryRef | null;
  collection: CollectionRef | null;
  product:
    | {
        id: string;
        name: string;
        slug: string;
        sellingPrice: number;
        sellingPriceOriginal: number;
        mrp: number;
        discountPercent: number;
        strikePrice: number;
        hasDiscount: boolean;
        effectiveDiscountPercent: number;
        offerLabel: string | null;
        imageUrl: string | null;
        metalType: MetalType | null;
        purity: Purity | null;
        deliveryEstimate: DeliveryEstimate | null;
      }
    | null;
  // Populated for CATEGORY_PRODUCTS items (top 5 published products in the
  // item's linked category) and COLLECTION_SHOWCASE items (top 10 published
  // products in the item's linked collection) — see homepage.repository.js.
  // Empty array for every other section type.
  products: ProductCard[];
}

export type HomepageSectionType =
  | 'HERO'
  | 'BENTO_CATEGORIES'
  | 'NEW_ARRIVALS'
  | 'COLLECTION_CARDS'
  | 'SHOP_BY_MATERIAL'
  | 'FEATURED_PRODUCT'
  | 'BEST_SELLERS'
  | 'SHOP_BY_PRICE'
  | 'OCCASION_CARDS'
  | 'INSTAGRAM'
  | 'NEWSLETTER'
  | 'TRUST_STRIP'
  | 'COLLECTION_SHOWCASE'
  | 'CAMPAIGN_BANNERS'
  | 'CATEGORY_PRODUCTS';

export interface HomepageSection {
  id: string;
  type: HomepageSectionType;
  heading: string | null;
  items: HomepageItem[];
}

export interface SearchResults {
  products: ProductCard[];
  categories: CategoryRef[];
  collections: CollectionRef[];
}

// null when the category has no banner configured, or an admin has
// disabled it — callers only ever need to check for null, never a separate
// `enabled` flag (see categories.controller.js's toDto).
export interface CategoryBanner {
  eyebrow: string | null;
  description: string | null;
  imageUrl: string | null;
  imageUrlMobile: string | null;
  altText: string | null;
  textColor: 'LIGHT' | 'DARK';
  textPosition: 'LEFT' | 'CENTER' | 'RIGHT';
  focalPosition: 'LEFT' | 'CENTER' | 'RIGHT';
}

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  banner: CategoryBanner | null;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
}

export interface ProductImage {
  id: string;
  type: 'ORIGINAL' | 'AI_GENERATED' | 'PRODUCT_SIZE';
  variant: string;
  format: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}

// Only ever present when the backend has an eligible (currently passed,
// version-matched) Product Size Image — a stale/failed one is already
// excluded server-side, so this frontend never has to reason about
// staleness itself (see backend/src/services/productsService.js's
// attachProductSizeImage). Text-only; safe to show even without the image.
export interface ProductSizeMeasurements {
  jewelleryType: string | null;
  unit: 'mm' | 'cm';
  measurements: Record<string, number | string>;
  includedParts: string[];
  excludedParts: string[];
  note: string | null;
}

export interface PriceBreakup {
  goldValue: number;
  diamondValue: number;
  diamondValueOriginal: number;
  makingCharge: number;
  makingChargeOriginal: number;
  makingChargeDiscountPercent: number;
  diamondDiscountPercent: number;
  gstAmount: number;
  total: number;
}

export interface ProductSize {
  id: string;
  label: string;
  stockQuantity: number;
  availableStock: number;
  weightGrams: number | null;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  sku: string;
  categoryId: string | null;
  collectionId: string | null;
  shortDescription: string | null;
  fullDescription: string | null;

  metalType: 'GOLD' | 'PLATINUM';
  purity: Purity | null;
  goldColor: GoldColor | null;
  grossWeightGrams: number | null;
  netWeightGrams: number | null;
  goldWeightGrams: number | null;
  diamondWeightGrams: number | null;
  diamondWeightCarats: number | null;
  diamondConfigId: string | null;
  diamondConfigName: string | null;
  diamondCount: number | null;
  diamondType: string | null;
  diamondColour: string | null;
  diamondClarity: string | null;
  gemstone: string | null;
  certification: string | null;
  productSize: string | null;
  // Overrides the "Size" wording on the storefront (e.g. "Length" for a
  // chain) — null means plain "Size".
  sizeLabel: string | null;
  careInstructions: string | null;

  priceBreakup: PriceBreakup;
  mrp: number;
  sellingPrice: number;
  sellingPriceOriginal: number;
  discountPercent: number;
  strikePrice: number;
  hasDiscount: boolean;
  effectiveDiscountPercent: number;
  offerLabel: string | null;

  stockQuantity: number;
  availableStock: number;
  status: string;
  isPriceLocked: boolean;
  isFeatured: boolean;
  showDeliveryChecker: boolean;
  isNew: boolean;
  deliveryEstimate: DeliveryEstimate | null;

  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;

  ratingAvg: number;
  ratingCount: number;

  images: ProductImage[];
  productSizeMeasurements: ProductSizeMeasurements | null;

  // Admin-form-shaped convenience views, derived server-side from
  // `attributes`/`variants` below — existing selectors (ColorSelector,
  // PillSelector, SizeSelector) read these directly, unchanged.
  sizes: ProductSize[];
  goldColorOptions: GoldColor[];
  purityOptions: Purity[];
  diamondOptions: { id: string; name: string }[];

  // The generic attribute + variant model — every real sellable combination
  // is one entry in `variants`, with its own stock/availability/weight
  // overrides. useVariantSelection resolves a selection (goldColor/purity/
  // diamondConfigId/sizeId, same as before) to one of these to get a real
  // variantId for pricing/cart/checkout.
  attributes: ProductAttribute[];
  variants: ProductVariant[];
}

export interface ProductAttribute {
  code: string;
  name: string;
  values: { id: string; value: string; label: string; refId: string | null }[];
}

export interface ProductVariant {
  id: string;
  isAvailable: boolean;
  stockQuantity: number;
  availableStock: number;
  goldWeightGrams: number | null;
  diamondWeightGrams: number | null;
  diamondWeightCarats: number | null;
  attributeValueIds: string[];
}

// Live-recomputed price for a specific variant — same pricing engine cart/
// checkout use, so what's shown while shopping matches what gets charged.
export interface VariantPricePreview {
  purity: string | null;
  diamondConfigId: string | null;
  goldColor: string | null;
  goldWeightGrams: number | null;
  diamondWeightCarats: number | null;
  goldValue: number;
  diamondValue: number;
  diamondValueOriginal: number;
  makingCharge: number;
  makingChargeOriginal: number;
  makingChargeDiscountPercent: number;
  diamondDiscountPercent: number;
  gstAmount: number;
  sellingPrice: number;
  sellingPriceOriginal: number;
  mrp: number;
  discountPercent: number;
  strikePrice: number;
  hasDiscount: boolean;
  effectiveDiscountPercent: number;
  offerLabel: string | null;
}

export type SortOption = 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'bestseller';
export type MetalType = 'GOLD' | 'PLATINUM';
export type Purity = '9K' | '14K' | '18K' | '22K' | '24K';
export type GoldColor = 'YELLOW' | 'ROSE' | 'WHITE';

export interface CategoryFilterCounts {
  total: number;
  subcategories: { id: string; name: string; slug: string; count: number }[];
}

export interface ProductListResponse {
  products: ProductCard[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CartItem {
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  categorySlug: string | null;
  primaryImageUrl: string | null;
  metalType: MetalType;
  purity: Purity | null;
  goldColor: GoldColor | null;
  productSize: string | null;
  sizeLabel: string | null;
  diamondConfigId: string | null;
  diamondConfigName: string | null;
  sellingPrice: number;
  sellingPriceOriginal: number;
  mrp: number;
  availableStock: number;
  quantity: number;
  lineTotal: number;
  isBackordered: boolean;
}


export interface Cart {
  items: CartItem[];
  subtotal: number;
  gstAmount: number;
  itemCount: number;
  // Live, recalculated on every fetch (not yet an order) — see Order.deliveryEstimate
  // for the permanent, frozen version stored once checkout actually happens.
  deliveryEstimate: DeliveryEstimate | null;
}

// Backend's wishlistService.toItemDto now reuses the same toListDto as the
// PLP (see products.controller.js) — a wishlist card carries every field a
// PLP card does (pricing, offer, rating, etc.), plus productId for the
// existing move-to-bag/remove actions.
export interface WishlistItem extends ProductCard {
  productId: string;
}

export interface Wishlist {
  items: WishlistItem[];
}

export interface Customer {
  id: string;
  mobileNumber: string;
  fullName: string | null;
  email: string | null;
}

export type AddressType = 'HOME' | 'OFFICE' | 'OTHER';

export interface Address {
  id: string;
  type: AddressType;
  isDefault: boolean;
  name: string;
  mobileNumber: string;
  addressLine: string;
  building: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export type AddressInput = Omit<Address, 'id' | 'isDefault'> & { isDefault?: boolean };

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  goldValue: number;
  diamondValue: number;
  makingCharge: number;
  gstAmount: number;
  unitPrice: number;
  lineTotal: number;
  canReview: boolean;
  sizeLabel: string | null;
  goldColor: string | null;
  purity: string | null;
  diamondConfigName: string | null;
  isBackordered: boolean;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerifiedPurchase: boolean;
  reviewerName: string;
  createdAt: string;
}

export interface ReviewListResponse {
  reviews: Review[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ReviewInput {
  rating: number;
  title?: string | null;
  body?: string | null;
  orderItemId: string;
}

export interface OrderStatusHistoryEntry {
  status: string;
  note: string | null;
  createdAt: string;
}

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'PAYMENT_FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'REFUNDED';

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  contactName: string;
  contactMobile: string;
  contactEmail: string;
  shippingAddress: Omit<Address, 'id' | 'isDefault'>;
  deliveryNote: string | null;
  // Snapshot frozen at checkout — never recalculated on read, so this stays
  // fixed forever regardless of when the order page is later viewed.
  deliveryEstimate: DeliveryEstimate | null;
  subtotal: number;
  discountAmount: number;
  couponCode: string | null;
  gstAmount: number;
  shippingAmount: number;
  totalAmount: number;
  createdAt: string;
  items: OrderItem[];
  statusHistory: OrderStatusHistoryEntry[];
  shipment?: Shipment | null;
}

export interface Shipment {
  id: string;
  provider: string;
  trackingNumber: string | null;
  courierName: string | null;
  status: string;
}

// Passed via React Router navigation state from PDP's Buy Now button
// (plan §11: "Buy Now creates a single-item cart and jumps straight in") —
// carries enough product data to render the summary without a refetch.
// Lost on a hard refresh, same as any navigation state; the checkout page
// falls back to an empty state if it's missing.
export interface BuyNowItem {
  productId: string;
  quantity: number;
  name: string;
  slug: string;
  categorySlug: string | null;
  sellingPrice: number;
  gstAmount: number;
  primaryImageUrl: string | null;
  availableStock: number;
  variantId: string | null;
  sizeLabel?: string | null;
  goldColor?: string | null;
  purity?: string | null;
  diamondConfigName?: string | null;
  isBackordered?: boolean;
  // Carried from the PDP's already-fetched product.deliveryEstimate — Buy
  // Now skips the cart entirely, so this is how Checkout gets a real,
  // backend-computed estimate for that flow without a second API call or
  // (forbidden) computing one client-side.
  deliveryEstimate?: DeliveryEstimate | null;
}

export interface CheckoutPayload {
  contact: { name: string; mobile: string; email: string };
  addressId: string;
  items: {
    productId: string;
    variantId?: string;
    quantity: number;
  }[];
  couponCode?: string;
  deliveryNote?: string;
}

export interface CouponApplyResponse {
  coupon: { code: string; discountType: 'PERCENT' | 'FLAT'; discountValue: number };
  discountAmount: number;
}

export interface CheckoutResponse {
  order: Order;
  payment: { provider: string; providerRef: string; paymentSessionId: string | null };
}
