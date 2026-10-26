import { searchQuerySchema } from '../validators/search.validators.js';
import * as searchService from '../services/searchService.js';
import { toListDto } from './products.controller.js';
import { calculateDeliveryEstimate } from '../services/deliveryEstimateService.js';

export async function search(req, res, next) {
  try {
    const { q, page, limit } = searchQuerySchema.parse(req.query);
    const { products, total, categories, collections } = await searchService.search(q, { page, limit });
    const deliveryEstimate = calculateDeliveryEstimate();

    res.json({
      products: products.map((row) => toListDto(row, deliveryEstimate)),
      total,
      page,
      limit,
      categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      collections: collections.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    });
  } catch (err) {
    next(err);
  }
}
