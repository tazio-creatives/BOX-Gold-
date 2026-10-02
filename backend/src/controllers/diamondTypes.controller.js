import { createDiamondTypeSchema, updateDiamondTypeSchema } from '../validators/diamondTypes.validators.js';
import {
  listDiamondTypes,
  findDiamondTypeById,
  createDiamondType,
  updateDiamondType,
} from '../repositories/diamondTypes.repository.js';
import { NotFoundError, AppError } from '../utils/AppError.js';

// No delete endpoint — diamond_types is FK-referenced (ON DELETE RESTRICT)
// from both products.diamond_type_id and pricing_rule_diamond_types, so a
// type that's ever been used can't be cleanly removed; deactivating
// (isActive: false) is the supported way to retire one.
function toDto(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function list(req, res, next) {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const rows = await listDiamondTypes({ activeOnly });
    res.json({ diamondTypes: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const input = createDiamondTypeSchema.parse(req.body);
    const row = await createDiamondType(input);
    res.status(201).json({ diamondType: toDto(row) });
  } catch (err) {
    if (err.code === '23505') return next(new AppError(409, 'A diamond type with this name already exists.'));
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const input = updateDiamondTypeSchema.parse(req.body);
    const existing = await findDiamondTypeById(req.params.id);
    if (!existing) throw new NotFoundError('Diamond type not found');
    const row = await updateDiamondType(req.params.id, input);
    res.json({ diamondType: toDto(row) });
  } catch (err) {
    next(err);
  }
}
