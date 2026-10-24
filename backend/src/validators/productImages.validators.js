import { z } from 'zod';

export const reorderImagesSchema = z.object({
  // Full sequence of the product's current sort_order values, in the new
  // desired order.
  order: z.array(z.number().int()).min(1),
});

const goldColour = z.enum(['YELLOW', 'ROSE', 'WHITE', 'ANY']);
const shotType = z.enum(['FRONT', 'ANGLE', 'SIDE', 'MACRO', 'MODEL', 'SIZE_GUIDE', 'OTHER']);

export const attachExistingImageSchema = z.object({
  sourceProductId: z.string().uuid(),
  sourceSortOrder: z.number().int(),
  goldColour: goldColour.optional(),
  shotType: shotType.optional(),
});

// Multipart text fields on the manual upload — both optional at the schema
// level; whether goldColour is required depends on the product (see
// productImages.controller.js requireColourChoice).
export const uploadImageLabelsSchema = z.object({
  goldColour: goldColour.optional(),
  shotType: shotType.optional(),
});

export const imageLabelsSchema = z.object({
  goldColour,
  shotType,
});
