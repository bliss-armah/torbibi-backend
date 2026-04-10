import { Router } from 'express';
import { SubscriptionController } from '../controllers/SubscriptionController';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

router.use(authenticate);

router.post('/shop/:shopId', asyncHandler(SubscriptionController.subscribe));
router.get('/shop/:shopId', asyncHandler(SubscriptionController.getStatus));
router.delete('/shop/:shopId', asyncHandler(SubscriptionController.cancel));

export default router;
