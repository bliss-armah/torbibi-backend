import { Router } from 'express';
import { ShopController } from '../controllers/ShopController';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { uploadLogo, uploadBanner } from '../../../infrastructure/storage/upload.middleware';
import { CreateShopSchema, UpdateShopSchema } from '../../../application/shops/dtos/shop.dto';

const router = Router();

// Public
router.get('/', asyncHandler(ShopController.listPublic));
router.get('/:slug', asyncHandler(ShopController.getBySlug));

// Protected — shop owners only
router.use(authenticate);
router.get('/my/shops', asyncHandler(ShopController.getMyShops));
router.post('/', validate(CreateShopSchema), asyncHandler(ShopController.create));
router.patch('/:shopId', validate(UpdateShopSchema), asyncHandler(ShopController.update));

// Image uploads — multipart/form-data; field name: 'logo' or 'banner'
router.patch('/:shopId/logo', uploadLogo, asyncHandler(ShopController.uploadLogo));
router.patch('/:shopId/banner', uploadBanner, asyncHandler(ShopController.uploadBanner));

export default router;
