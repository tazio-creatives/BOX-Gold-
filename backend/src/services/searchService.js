import { searchProducts } from '../repositories/products.repository.js';
import { searchCategories } from '../repositories/categories.repository.js';
import { searchCollections } from '../repositories/collections.repository.js';

export const SEARCH_MAX_WORDS = 8;

// Same normalisation the product query applies to names/SKUs/categories:
// lowercase, every run of non-letters/digits -> one space. "Axel  Gents",
// "axel gents" and "AXEL-GENTS" all become "axel gents".
export function normaliseSearchText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Plural -> stem, so "rings", "earrings", "bangles", "necklaces" and their
// singulars match each other (words are matched as word *prefixes*, so the
// stem "necklac" still finds "necklace" and "necklaces").
export function stemSearchWord(word) {
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function parseSearchTerm(term) {
  const normalised = normaliseSearchText(term);
  const words = [...new Set(normalised.split(' ').filter(Boolean).map(stemSearchWord))].slice(0, SEARCH_MAX_WORDS);
  return { normalised, words };
}

// Products: up to `limit` ranked results plus the total match count (for
// "View all results" and the results page). Category and collection
// suggestions only for the dropdown's first page.
export async function search(term, { page = 1, limit = 8 } = {}) {
  const { normalised, words } = parseSearchTerm(term);
  if (!normalised) return { products: [], total: 0, categories: [], collections: [] };

  const [{ rows, total }, categories, collections] = await Promise.all([
    searchProducts(normalised, words, { limit, offset: (page - 1) * limit }),
    page === 1 ? searchCategories(term) : [],
    page === 1 ? searchCollections(term) : [],
  ]);
  return { products: rows, total, categories, collections };
}
