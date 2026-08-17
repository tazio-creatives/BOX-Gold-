import { searchQuerySchema } from '../validators/search.validators.js';
import * as searchService from '../services/searchService.js';
import { toListDto } from './products.controller.js';

export async function search(req, res, next) {
  try {
    const { q } = searchQuerySchema.parse(req.query);
    const { products, categories, collections } = await searchService.search(q);

    res.json({
      products: products.map(toListDto),
      categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      collections: collections.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    });
  } catch (err) {
    next(err);
  }
}
