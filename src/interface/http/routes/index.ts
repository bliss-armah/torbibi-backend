import { Router } from 'express';
import authRoutes from './auth.routes';
import shopRoutes from './shop.routes';
import productRoutes from './product.routes';
import orderRoutes from './order.routes';
import paymentRoutes from './payment.routes';
import subscriptionRoutes from './subscription.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/shops', shopRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/subscriptions', subscriptionRoutes);

export default router;
