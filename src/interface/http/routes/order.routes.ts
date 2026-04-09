import { Router } from 'express';
import { OrderController } from '../controllers/OrderController';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { CreateOrderSchema, UpdateOrderStatusSchema } from '../../../application/orders/dtos/order.dto';
import express from 'express';

const router = Router();

// Paystack webhook — raw body needed for signature verification
router.post(
  '/webhooks/paystack',
  express.raw({ type: 'application/json' }),
  asyncHandler(OrderController.paystackWebhook)
);

// Authenticated routes
router.use(authenticate);

// Customer routes
router.get('/my', asyncHandler(OrderController.getMyOrders));
router.get('/:orderId', asyncHandler(OrderController.getOne));
router.post('/shop/:shopId', validate(CreateOrderSchema), asyncHandler(OrderController.create));

// Shop owner routes
router.get('/shop/:shopId/list', asyncHandler(OrderController.listForShop));
router.patch('/shop/:shopId/:orderId/status', validate(UpdateOrderStatusSchema), asyncHandler(OrderController.updateStatus));

export default router;
