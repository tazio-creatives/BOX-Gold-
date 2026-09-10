export interface Admin {
  id: string;
  email: string;
  fullName: string;
  role: { id: string; name: string; permissions: string[] };
}

export type MetalType = 'GOLD' | 'PLATINUM';
export type Purity = '9K' | '14K' | '18K' | '22K' | '24K';
export type GoldColor = 'YELLOW' | 'ROSE' | 'WHITE';
export type ProductStatus = 'DRAFT' | 'AI_PROCESSING' | 'AI_READY' | 'PUBLISHED' | 'FAILED';

export interface ProductListItem {
  id: string;
  slug: string;
  categorySlug: string | null;
  name: string;
  metalType: MetalType;
  purity: Purity | null;
  goldColor: GoldColor | null;
  sellingPrice: number;
  mrp: number;
  discountPercent: number;
  primaryImageUrl: string | null;
  availableStock: number;
  ratingAvg: number;
  ratingCount: number;
  isFeatured: boolean;
  isBestSeller: boolean;
  status?: ProductStatus;
}

export interface ProductImage {
  id: string;
  type: 'ORIGINAL' | 'AI_GENERATED';
  variant: string;
  format: string;
  url: string;
  isPrimary: boolean;
}

export interface ProductSize {
  id: string;
  label: string;
  stockQuantity: number;
  availableStock: number;
  weightGrams: number | null;
  diamondWeightCarats: number | null;
}

export interface ProductSizeInput {
  label: string;
  stockQuantity: number;
  weightGrams: number | null;
  diamondWeightCarats: number | null;
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
  metalType: MetalType;
  purity: Purity | null;
  goldColor: GoldColor | null;
  grossWeightGrams: number | null;
  netWeightGrams: number | null;
  goldWeightGrams: number | null;
  diamondWeightGrams: number | null;
  diamondWeightCarats: number | null;
  diamondConfigId: string | null;
  diamondCount: number | null;
  diamondType: string | null;
  diamondColour: string | null;
  diamondClarity: string | null;
  gemstone: string | null;
  certification: string | null;
  productSize: string | null;
  // Overrides the "Size" wording on the admin form and storefront (e.g.
  // "Length" for a chain) — null means plain "Size".
  sizeLabel: string | null;
  careInstructions: string | null;
  priceBreakup: {
    goldValue: number;
    diamondValue: number;
    diamondValueOriginal: number;
    makingCharge: number;
    makingChargeOriginal: number;
    makingChargeDiscountPercent: number;
    diamondDiscountPercent: number;
    gstAmount: number;
    total: number;
  };
  // Admin-set % of gold value this product's making charge is computed from
  // (null for products still on a flat making-charge, e.g. platinum, or
  // never migrated to percent-based pricing) — the source of truth for live
  // recalculation; priceBreakup.makingCharge above is just its computed
  // result at the current gold rate/purity/size.
  makingChargePercent: number | null;
  mrp: number;
  sellingPrice: number;
  sellingPriceOriginal: number;
  discountPercent: number;
  offerLabel: string | null;
  stockQuantity: number;
  availableStock: number;
  status: ProductStatus;
  isPriceLocked: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  showDeliveryChecker: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  ratingAvg: number;
  ratingCount: number;
  images: ProductImage[];
  sizes: ProductSize[];

  goldColorOptions: GoldColor[];
  purityOptions: Purity[];
  diamondOptions: { id: string; name: string }[];

  // Generic attribute+value catalogue this product currently offers —
  // what Availability Rules picks its two sides from. Same data as
  // goldColorOptions/purityOptions/diamondOptions/sizes above, just
  // attribute-count-agnostic.
  attributes: ProductAttributeGroup[];
}

export interface ProductAttributeGroup {
  code: string;
  name: string;
  values: { id: string; value: string; label: string; refId: string | null }[];
}

export interface ProductInput {
  name: string;
  sku: string;
  categoryId?: string | null;
  collectionId?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  metalType: MetalType;
  purity?: Purity | null;
  goldColor?: GoldColor | null;
  goldWeightGrams?: number | null;
  diamondWeightGrams?: number | null;
  diamondWeightCarats?: number | null;
  diamondConfigId?: string | null;
  diamondCount?: number | null;
  diamondType?: string | null;
  diamondColour?: string | null;
  diamondClarity?: string | null;
  gemstone?: string | null;
  certification?: string | null;
  productSize?: string | null;
  sizeLabel?: string | null;
  careInstructions?: string | null;
  goldValue?: number;
  diamondValue?: number;
  diamondValueIsManual?: boolean;
  makingCharge?: number;
  makingChargePercent?: number | null;
  gstPercent?: number;
  mrp?: number;
  sellingPrice?: number;
  makingChargeDiscountPercent?: number;
  diamondDiscountPercent?: number;
  stockQuantity?: number;
  status?: ProductStatus;
  showDeliveryChecker?: boolean;
  slug?: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  sizes?: ProductSizeInput[];

  goldColors?: GoldColor[];
  purities?: Purity[];
  diamondConfigIds?: string[];

  // Per-exact-combination overrides applied in the same save that sets up
  // the axes above — lets a brand-new product be fully configured (stock/
  // weight/availability per combination) without a separate trip into the
  // variant editor afterward. Sent only by the "Add Product" create flow.
  variantOverrides?: VariantOverrideInput[];

  // Weight Defaults / Purity Pricing Rules, entered in the same continuous
  // product form and saved by the one Save Product action — keyed by purity
  // code / size label (never a database UUID; the backend resolves those
  // itself from `purities`/`sizes` above). Omitting a field entirely on an
  // update means "leave the saved rules untouched"; sending an explicit
  // empty array/collection means "clear them" — see
  // productsService.js's applyWeightAndPricingRulesInTx.
  weightRules?: WeightRulesInput;
  purityPricingRules?: PurityPricingRuleInput[];
}

export interface WeightRulesInput {
  purityRules: { purity: Purity; goldWeightGrams: number }[];
  puritySizeRules: { purity: Purity; sizeLabel: string; goldWeightGrams: number }[];
}

export interface PurityPricingRuleInput {
  purity: Purity;
  // null = inherit the product-level default for this one field; a number
  // (including 0) is an explicit override — never coerced to 0 on omission.
  makingChargePercent: number | null;
  makingChargeDiscountPercent: number | null;
  diamondDiscountPercent: number | null;
}

export interface VariantOverrideInput {
  attributeValues: {
    goldColor?: GoldColor;
    purity?: Purity;
    diamondConfigId?: string;
    sizeLabel?: string;
  };
  stockQuantity?: number;
  goldWeightGrams?: number | null;
  diamondWeightGrams?: number | null;
  diamondWeightCarats?: number | null;
  isAvailable?: boolean;
}

// Admin always gets the full banner state (including `enabled` and any
// saved values while disabled) so the edit form can populate its inputs —
// unlike the storefront's Category type, which collapses a disabled/unset
// banner straight to `null`.
export interface CategoryBanner {
  enabled: boolean;
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
  banner: CategoryBanner;
}

// What create/update actually accept — flat fields (matching
// categories.validators.js's schema) rather than Category's nested `banner`
// GET shape, since the backend has no nested-object input handling.
export interface CategoryInput {
  parentId: string | null;
  name: string;
  slug?: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  bannerEnabled: boolean;
  bannerEyebrow: string | null;
  bannerDescription: string | null;
  bannerImageUrl: string | null;
  bannerImageUrlMobile: string | null;
  bannerAltText: string | null;
  bannerTextColor: 'LIGHT' | 'DARK';
  bannerTextPosition: 'LEFT' | 'CENTER' | 'RIGHT';
  bannerFocalPosition: 'LEFT' | 'CENTER' | 'RIGHT';
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
}

export interface PricingPreviewResult {
  goldValue: number;
  diamondValue: number;
  makingCharge: number;
  gstPercent: number;
  sellingPrice: number;
}

// Raw DB rows — these two admin pricing endpoints return columns as-is
// (snake_case, NUMERIC as string) rather than mapping to a camelCase DTO.
export interface GoldRateRow {
  id: string;
  purity: Purity;
  rate_per_gram: string;
  source: string;
  fetched_at: string;
}

export interface DiamondConfig {
  id: string;
  name: string;
  ratePerCent: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

// Server-computed 8-10 calendar-day window, frozen onto the order at
// checkout (backend/src/services/deliveryEstimateService.js /
// checkoutService.js) — never recalculated once the order exists.
export interface DeliveryEstimate {
  minimumDays: number;
  maximumDays: number;
  earliestDate: string;
  latestDate: string;
  timezone: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  contactName: string;
  contactMobile: string;
  totalAmount: number;
  createdAt: string;
  productName: string | null;
  itemCount: number;
  deliveryEstimate: DeliveryEstimate | null;
}

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
  isBackordered: boolean;
}

export interface OrderStatusHistoryEntry {
  status: string;
  note: string | null;
  createdAt: string;
}

export interface ShippingAddress {
  type: string;
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

export interface ShipmentTrackingEvent {
  id: string;
  status: string;
  location: string | null;
  note: string | null;
  source: 'MANUAL' | 'SYSTEM' | 'WEBHOOK';
  createdAt: string;
}

export interface Shipment {
  id: string;
  provider: string;
  trackingNumber: string | null;
  courierName: string | null;
  status: string;
  trackingEvents: ShipmentTrackingEvent[];
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  contactName: string;
  contactMobile: string;
  contactEmail: string;
  shippingAddress: ShippingAddress;
  deliveryNote: string | null;
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
  shipment: Shipment | null;
}

export interface Customer {
  id: string;
  mobileNumber: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
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
  | 'CAMPAIGN_BANNERS'
  | 'CATEGORY_PRODUCTS'
  | 'COLLECTION_SHOWCASE';

export interface HomepageItem {
  id: string;
  imageUrl: string | null;
  imageUrlMobile: string | null;
  heading: string | null;
  subheading: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  categoryId: string | null;
  collectionId: string | null;
  productId: string | null;
  sortOrder: number;
}

export interface HomepageSection {
  id: string;
  type: HomepageSectionType;
  heading: string | null;
  isEnabled: boolean;
  sortOrder: number;
  items: HomepageItem[];
}

export interface HomepageItemInput {
  imageUrl?: string | null;
  imageUrlMobile?: string | null;
  heading?: string | null;
  subheading?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  categoryId?: string | null;
  collectionId?: string | null;
  productId?: string | null;
}

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AdminReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  reviewerName: string;
  reviewerMobile: string;
  productName: string;
  productSlug: string;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  minOrderValue: number;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  usageCount: number | null;
  createdAt: string;
}

export interface CouponInput {
  code?: string;
  discountType?: 'PERCENT' | 'FLAT';
  discountValue?: number;
  minOrderValue?: number;
  usageLimitTotal?: number | null;
  usageLimitPerUser?: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
}

export interface AuditLogEntry {
  id: string;
  adminUserId: string | null;
  adminEmail: string | null;
  adminFullName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminRole {
  id: string;
  name: string;
  permissions: string[];
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  role: { id: string; name: string };
  createdAt: string;
}

export interface AdminUserInput {
  email?: string;
  password?: string;
  fullName?: string;
  roleId?: string;
  isActive?: boolean;
}
