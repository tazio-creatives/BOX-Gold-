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
