import type { ProductDetail } from '../api/types';
import { SITE_URL } from '../config';

// JSON-LD builders (plan §1a/§13): Organization sitewide, BreadcrumbList
// everywhere, Product on PDP — rendered server-side into <head> so it's
// present in the initial HTML search engines see, not injected after the
// fact by client JS.

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BOX DIAMONDS',
    url: SITE_URL,
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function productJsonLd(product: ProductDetail, canonicalPath: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    description: product.shortDescription ?? product.name,
    image: product.images.filter((img) => img.variant === 'large').map((img) => img.url),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: product.sellingPrice,
      availability:
        product.availableStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}${canonicalPath}`,
    },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };
}
