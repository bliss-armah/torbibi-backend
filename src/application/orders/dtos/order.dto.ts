import { z } from 'zod';
import { GHANA_PHONE_REGEX } from '../../../shared/constants';

const ShippingAddressSchema = z.object({
  recipientName: z.string().min(2).max(100),
  phone: z.string().regex(GHANA_PHONE_REGEX, 'Invalid phone number'),
  region: z.string().min(1),
  city: z.string().min(1),
  area: z.string().optional(),
  digitalAddress: z.string().optional(),
  notes: z.string().max(300).optional(),
});

const OrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export const CreateOrderSchema = z.object({
  items: z.array(OrderItemSchema).min(1).max(50),
  shippingAddress: ShippingAddressSchema,
  deliveryFee: z.number().int().min(0).default(0),
  notes: z.string().max(300).optional(),
});

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
  cancelReason: z.string().max(300).optional(),
});

export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderStatusDto = z.infer<typeof UpdateOrderStatusSchema>;
