import {
  createDiamondConfigSchema,
  updateDiamondConfigSchema,
} from '../validators/diamondConfigs.validators.js';
import {
  listDiamondConfigs,
  findDiamondConfigById,
  createDiamondConfig,
  updateDiamondConfig,
  deleteDiamondConfig,
} from '../repositories/diamondConfigs.repository.js';
import { boss } from '../jobs/queue.js';
import { JOB_RECALCULATE_DIAMOND } from '../jobs/pricingJobs.js';
import { NotFoundError } from '../utils/AppError.js';

function toDto(row) {
  return {
    id: row.id,
    name: row.name,
    ratePerCent: Number(row.rate_per_carat),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function list(req, res, next) {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const rows = await listDiamondConfigs({ activeOnly });
    res.json({ diamondConfigs: rows.map(toDto) });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const input = createDiamondConfigSchema.parse(req.body);
    const row = await createDiamondConfig(input);
    res.status(201).json({ diamondConfig: toDto(row) });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const input = updateDiamondConfigSchema.parse(req.body);
    const existing = await findDiamondConfigById(req.params.id);
    if (!existing) throw new NotFoundError('Diamond quality tier not found');

    const row = await updateDiamondConfig(req.params.id, input);

    // Rate changed — recalculate every non-locked product on this tier, same
    // trigger pattern as a gold rate sync (never recalculates inline).
    if (input.ratePerCent != null && Number(input.ratePerCent) !== Number(existing.rate_per_carat)) {
      await boss.send(JOB_RECALCULATE_DIAMOND, { diamondConfigId: req.params.id });
    }

    res.json({ diamondConfig: toDto(row) });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const existing = await findDiamondConfigById(req.params.id);
    if (!existing) throw new NotFoundError('Diamond quality tier not found');
    await deleteDiamondConfig(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
