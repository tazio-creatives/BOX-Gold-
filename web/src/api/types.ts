export interface ProductCard {
  id: string;
  slug: string;
  categorySlug: string | null;
  name: string;
  metalType: 'GOLD' | 'PLATINUM';
  purity: string | null;
  goldColor: GoldColor | null;
  sellingPrice: number;
  mrp: number;
  discountPercent: number;
  primaryImageUrl: string | null;
  availableStock: number;
  ratingAvg: number;
  ratingCount: number;
  isNew: boolean;
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
        imageUrl: string | null;
        metalType: MetalType | null;
        purity: Purity | null;
      }
    | null;
  // Populated only for CATEGORY_PRODUCTS items — the auto-derived top 5
  // published products in the item's linked category (see
  // homepage.repository.js). Empty array for every other section type.
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

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
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

export interface ProductImage {
  id: string;
  type: 'ORIGINAL' | 'AI_GENERATED';
  variant: string;
  format: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface PriceBreakup {
  goldValue: number;
  diamondValue: number;
  makingCharge: number;
  gstAmount: number;
  total: number;
}

export interface ProductSize {
  id: string;
  label: string;
  stockQuantity: number;
  availableStock: number;
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
  purity: string | null;
  goldColor: GoldColor | null;
  grossWeightGrams: number | null;
  netWeightGrams: number | null;
  diamondWeightCarats: number | null;
  diamondCount: number | null;
  diamondType: string | null;
  diamondColour: string | null;
  diamondClarity: string | null;
  gemstone: string | null;
  certification: string | null;
  productSize: string | null;
  careInstructions: string | null;

  priceBreakup: PriceBreakup;
  mrp: number;
  sellingPrice: number;
  discountPercent: number;

  stockQuantity: number;
  availableStock: number;
  status: string;
  isPriceLocked: boolean;
  isFeatured: boolean;
  showDeliveryChecker: boolean;
  isNew: boolean;

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

// Live-recomputed price for a Purity/Diamond Quality selection — same
// pricing engine cart/checkout use, so what's shown while shopping matches
// what gets charged. Gold Color never affects price so isn't part of this.
export interface VariantPricePreview {
  purity: string | null;
  diamondConfigId: string | null;
  goldValue: number;
  diamondValue: number;
  makingCharge: number;
  gstAmount: number;
  sellingPrice: number;
  mrp: number;
  discountPercent: number;
}

export type SortOption = 'featured' | 'newest' | 'price_asc' | 'price_desc';
export type MetalType = 'GOLD' | 'PLATINUM';
export type Purity = '14K' | '18K' | '22K' | '24K';
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
  name: string;
  slug: string;
  categorySlug: string | null;
  primaryImageUrl: string | null;
  metalType: MetalType;
  purity: Purity | null;
  goldColor: GoldColor | null;
  productSize: string | null;
  sizeId: string | null;
  sizeLabel: string | null;
  diamondConfigId: string | null;
  diamondConfigName: string | null;
  sellingPrice: number;
  availableStock: number;
  quantity: number;
  lineTotal: number;
  isAvailable: boolean;
}

// One product/size/color/purity/diamond-quality combination a shopper has
// picked — threaded through cart add/update/remove and checkout.
export interface VariantSelection {
  sizeId?: string | null;
  goldColor?: string | null;
  purity?: string | null;
  diamondConfigId?: string | null;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  gstAmount: number;
  itemCount: number;
}

export interface WishlistItem {
  productId: string;
  name: string;
  slug: string;
  categorySlug: string | null;
  primaryImageUrl: string | null;
  sellingPrice: number;
  mrp: number;
  availableStock: number;
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
  sizeId?: string | null;
  sizeLabel?: string | null;
  goldColor?: string | null;
  purity?: string | null;
  diamondConfigId?: string | null;
  diamondConfigName?: string | null;
}

export interface CheckoutPayload {
  contact: { name: string; mobile: string; email: string };
  addressId: string;
  items: {
    productId: string;
    quantity: number;
    sizeId?: string;
    goldColor?: string;
    purity?: string;
    diamondConfigId?: string;
  }[];
  couponCode?: string;
}

export interface CouponApplyResponse {
  coupon: { code: string; discountType: 'PERCENT' | 'FLAT'; discountValue: number };
  discountAmount: number;
}

export interface CheckoutResponse {
  order: Order;
  payment: { provider: string; providerRef: string };
}
