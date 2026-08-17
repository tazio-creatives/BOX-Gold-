import { fetchCategories } from '../api/categories';
import { fetchCollections } from '../api/collections';
import { fetchProducts } from '../api/products';
import { SITE_URL } from '../config';

// Generated from published products/categories (plan §13) rather than a
// static file — pages through the same public /products endpoint the PLP
// uses, which already only returns PUBLISHED rows.
export async function buildSitemapXml(): Promise<string> {
  const [categoriesRes, collectionsRes] = await Promise.all([fetchCategories(), fetchCollections()]);

  const productUrls: string[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetchProducts({ page, limit: 100, sort: 'newest' });
    for (const product of res.products) {
      const categorySlug = product.categorySlug ?? product.slug;
      productUrls.push(`${SITE_URL}/${categorySlug}/${product.slug}`);
    }
    if (page >= res.totalPages) break;
    page += 1;
  }

  const urls = [
    `${SITE_URL}/`,
    ...categoriesRes.categories.map((c) => `${SITE_URL}/${c.slug}`),
    ...collectionsRes.collections.map((c) => `${SITE_URL}/collections/${c.slug}`),
    ...productUrls,
  ];

  const body = urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function buildRobotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /cart',
    'Disallow: /wishlist',
    'Disallow: /account',
    'Disallow: /login',
    'Disallow: /checkout',
    'Disallow: /order-confirmation',
    'Disallow: /search',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
