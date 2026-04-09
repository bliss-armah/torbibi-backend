import { Router } from 'express';
import { ProductController } from '../controllers/ProductController';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { uploadProductImages } from '../../../infrastructure/storage/upload.middleware';
import {
  CreateProductSchema,
  UpdateProductSchema,
  PublishProductSchema,
} from '../../../application/products/dtos/product.dto';

const router = Router();

// Public storefront routes (by shop slug)
router.get('/storefront/:shopSlug', asyncHandler(ProductController.listForStorefront));
router.get('/storefront/:shopSlug/:productId', asyncHandler(ProductController.getOne));

// Protected dashboard routes (by shop ID)
router.use(authenticate);
router.get('/shop/:shopId', asyncHandler(ProductController.listForDashboard));
router.post('/shop/:shopId', validate(CreateProductSchema), asyncHandler(ProductController.create));
router.get('/shop/:shopId/:productId', asyncHandler(ProductController.getOne));
router.patch('/shop/:shopId/:productId', validate(UpdateProductSchema), asyncHandler(ProductController.update));
router.patch('/shop/:shopId/:productId/status', validate(PublishProductSchema), asyncHandler(ProductController.publish));
router.delete('/shop/:shopId/:productId', asyncHandler(ProductController.delete));

// Image upload — returns Cloudinary URLs to be included in create/update payload
// multer handles multipart/form-data; field name: 'images' (up to 5)
router.post('/shop/:shopId/images', uploadProductImages, asyncHandler(ProductController.uploadImages));

export default router;
