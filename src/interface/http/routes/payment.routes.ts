import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { RegisterSubaccountSchema } from '../../../application/payments/dtos/payment.dto';

const router = Router();

router.use(authenticate);

// Payout subaccount — register once to enable automatic payment splitting per transaction
router.post(
  '/subaccount/shop/:shopId',
  validate(RegisterSubaccountSchema),
  asyncHandler(PaymentController.registerSubaccount)
);
router.get('/subaccount/shop/:shopId', asyncHandler(PaymentController.getSubaccount));

export default router;
