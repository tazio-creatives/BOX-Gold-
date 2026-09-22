import multer from 'multer';
import { env } from '../config/env.js';

// Memory storage — images are small enough at this scale to buffer fully
// before handing to sharp; avoids a temp-file cleanup concern.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  },
});

// Stricter allowlist for the OpenAI image-edit pipeline — that API only
// accepts PNG/JPEG/WebP source images, so reject anything else up front
// rather than letting the provider call fail after an upload round-trip.
const ENHANCE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const uploadEnhanceImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ENHANCE_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, JPEG, or WebP uploads are allowed'));
    }
    cb(null, true);
  },
});

// Optional unboxing video attached to a return request — a customer's raw
// phone recording, so allow the common container formats rather than
// dictating one, and a much higher size limit than the image uploads above.
const RETURN_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo']);

export const uploadReturnVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxReturnVideoSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!RETURN_VIDEO_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only MP4, MOV, WebM, or AVI video uploads are allowed'));
    }
    cb(null, true);
  },
});
