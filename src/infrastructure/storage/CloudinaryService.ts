import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';
import { logger } from '../../shared/utils/logger';

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Cloudinary image storage service.
 *
 * Design decisions:
 * - Uses stream-based upload (upload_stream) so files never touch disk.
 *   multer memoryStorage() gives us the Buffer; we pipe it straight to Cloudinary.
 * - All uploads are transformed at the CDN level (max 800px wide, quality auto,
 *   format auto) so we never need to ship a Jimp/Sharp dependency.
 * - public_id is always stored alongside the URL so images can be deleted/replaced
 *   without needing to parse the URL.
 */
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  /**
   * Upload a single image buffer to Cloudinary.
   * @param buffer - File buffer from multer memoryStorage
   * @param folder - Cloudinary folder path (e.g. 'torbibi/products/shop-id')
   * @param publicIdOverride - Optional fixed public_id (used for logo/banner replace)
   */
  async uploadImage(
    buffer: Buffer,
    folder: string,
    publicIdOverride?: string
  ): Promise<UploadResult> {
    const options: UploadApiOptions = {
      folder,
      resource_type: 'image',
      // Max 800px wide, preserve aspect ratio, auto quality and format (WebP on modern browsers)
      transformation: [
        { width: 800, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' },
      ],
    };

    if (publicIdOverride) {
      // Overwrite the existing asset at this public_id (for logo/banner updates)
      options.public_id = publicIdOverride;
      options.overwrite = true;
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error || !result) {
          logger.error('Cloudinary upload failed', { folder, error });
          reject(new Error(error?.message ?? 'Cloudinary upload failed'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      stream.end(buffer);
    });
  }

  /**
   * Delete an image from Cloudinary by its public_id.
   * Failures are logged but not thrown — a missing image should not break the request.
   */
  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      logger.warn('Cloudinary delete failed (non-fatal)', { publicId, error });
    }
  }
}

export const cloudinaryService = new CloudinaryService();
