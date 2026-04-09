import multer from 'multer';
import { RequestHandler } from 'express';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES, MAX_PRODUCT_IMAGES } from '../../shared/constants';

/**
 * multer middleware factory using in-memory storage.
 * Files never touch disk — the buffer is uploaded directly to Cloudinary.
 *
 * wrapMulter uses `any`-typed params internally to escape the type identity
 * conflict between @types/compression (which bundles its own express-serve-static-core)
 * and @types/express. The exported signatures are typed as Express RequestHandler.
 */
const baseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapMulter(handler: (req: any, res: any, next: any) => void): RequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any, next: any) => handler(req, res, next);
}

/** Single image upload — field name: 'image' */
export const uploadSingleImage: RequestHandler = wrapMulter(baseUpload.single('image'));

/** Logo upload — field name: 'logo' */
export const uploadLogo: RequestHandler = wrapMulter(baseUpload.single('logo'));

/** Banner upload — field name: 'banner' */
export const uploadBanner: RequestHandler = wrapMulter(baseUpload.single('banner'));

/** Multiple product images — field name: 'images', max MAX_PRODUCT_IMAGES */
export const uploadProductImages: RequestHandler = wrapMulter(
  baseUpload.array('images', MAX_PRODUCT_IMAGES)
);
