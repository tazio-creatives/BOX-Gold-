import sharp from 'sharp';
import crypto from 'node:crypto';
import { storageProvider } from '../providers/storage/index.js';

// Listing pages request "small", PDP requests "large" (plan §9/§35) — these
// four cover both plus a lightweight thumbnail for admin gallery grids.
const VARIANT_WIDTHS = {
  thumbnail: 150,
  small: 400,
  medium: 800,
  large: 1600,
};

// Derives thumbnail/small/medium/large in AVIF+WebP (plan §9) and stores
// the original — normalized to a single high-quality JPEG rather than the
// literal uploaded bytes, since product_images.format is constrained to
// ('avif','webp','jpeg') at the DB level (plan §3). "Never modified" in the
// plan means no cropping/retouching, not byte-for-byte format preservation.
export async function processAndStoreImage(productId, sourceBuffer) {
  const baseKey = `products/${productId}/${crypto.randomUUID()}`;
  const results = [];

  for (const [variant, width] of Object.entries(VARIANT_WIDTHS)) {
    const resized = sharp(sourceBuffer).resize({ width, withoutEnlargement: true });

    const avifBuffer = await resized.clone().avif({ quality: 60 }).toBuffer();
    const avifSaved = await storageProvider.save(`${baseKey}-${variant}.avif`, avifBuffer);
    results.push({ variant, format: 'avif', url: avifSaved.url, key: avifSaved.key });

    const webpBuffer = await resized.clone().webp({ quality: 75 }).toBuffer();
    const webpSaved = await storageProvider.save(`${baseKey}-${variant}.webp`, webpBuffer);
    results.push({ variant, format: 'webp', url: webpSaved.url, key: webpSaved.key });
  }

  const originalBuffer = await sharp(sourceBuffer).jpeg({ quality: 95 }).toBuffer();
  const originalSaved = await storageProvider.save(`${baseKey}-original.jpeg`, originalBuffer);
  results.push({ variant: 'original', format: 'jpeg', url: originalSaved.url, key: originalSaved.key });

  return results;
}
