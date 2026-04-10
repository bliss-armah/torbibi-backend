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

// Public — guests can place orders
router.post('/shop/:shopId', validate(CreateOrderSchema), asyncHandler(OrderController.create));

// Authenticated — must be registered before /:orderId to prevent "my" matching as an orderId
router.get('/my', authenticate, asyncHandler(OrderController.getMyOrders));

// Shop owner routes — /shop/ prefix avoids conflict with /:orderId
router.get('/shop/:shopId/list', authenticate, asyncHandler(OrderController.listForShop));
router.patch('/shop/:shopId/:orderId/status', authenticate, validate(UpdateOrderStatusSchema), asyncHandler(OrderController.updateStatus));

// Public — verify payment via Paystack callback reference (called by confirmation page)
router.post('/:orderId/verify-payment', asyncHandler(OrderController.verifyPayment));

// Public — view single order by UUID (unguessable, serves as access token for guests)
router.get('/:orderId', asyncHandler(OrderController.getOne));

export default router;
