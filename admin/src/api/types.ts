export interface Admin {
  id: string;
  email: string;
  fullName: string;
  role: { id: string; name: string; permissions: string[] };
}

export type MetalType = 'GOLD' | 'PLATINUM';
export type Purity = '14K' | '18K' | '22K' | '24K';
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
}

export interface ProductSizeInput {
  label: string;
  stockQuantity: number;
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
  diamondWeightCarats: number | null;
  diamondConfigId: string | null;
  diamondCount: number | null;
  diamondType: string | null;
  diamondColour: string | null;
  diamondClarity: string | null;
  gemstone: string | null;
  certification: string | null;
  productSize: string | null;
  careInstructions: string | null;
  priceBreakup: { goldValue: number; diamondValue: number; makingCharge: number; gstAmount: number; total: number };
  mrp: number;
  sellingPrice: number;
  discountPercent: number;
  stockQuantity: number;
  availableStock: number;
  status: ProductStatus;
  isPriceLocked: boolean;
  isFeatured: boolean;
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
  diamondOptions: { id: string; name: string; ratePerCent: number }[];
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
  grossWeightGrams?: number | null;
  netWeightGrams?: number | null;
  diamondWeightCarats?: number | null;
  diamondConfigId?: string | null;
  diamondCount?: number | null;
  diamondType?: string | null;
  diamondColour?: string | null;
  diamondClarity?: string | null;
  gemstone?: string | null;
  certification?: string | null;
  productSize?: string | null;
  careInstructions?: string | null;
  goldValue?: number;
  diamondValue?: number;
  diamondValueIsManual?: boolean;
  makingCharge?: number;
  gstPercent?: number;
  mrp?: number;
  sellingPrice?: number;
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
  | 'CATEGORY_PRODUCTS';

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
