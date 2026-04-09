import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { RegisterRecipientSchema } from '../../../application/payments/dtos/payment.dto';

const router = Router();

// All payment management routes require authentication
router.use(authenticate);

// Payout account registration — must register before any payouts can be sent
router.post(
  '/recipients/shop/:shopId',
  validate(RegisterRecipientSchema),
  asyncHandler(PaymentController.registerRecipient)
);
router.get('/recipients/shop/:shopId', asyncHandler(PaymentController.getRecipient));

// Payout history for a shop
router.get('/payouts/shop/:shopId', asyncHandler(PaymentController.listPayouts));

export default router;
