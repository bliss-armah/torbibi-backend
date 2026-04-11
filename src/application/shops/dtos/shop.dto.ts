import { z } from 'zod';
import { GHANA_PHONE_REGEX } from '../../../shared/constants';

const AddressSchema = z.object({
  region: z.string().min(1),
  city: z.string().min(1),
  area: z.string().optional(),
  digitalAddress: z.string().optional(),
});

export const CreateShopSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  phone: z.string().regex(GHANA_PHONE_REGEX, 'Invalid Ghanaian phone number'),
  email: z.string().email().optional(),
  address: AddressSchema.optional(),
});

export const UpdateShopSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  phone: z.string().regex(GHANA_PHONE_REGEX).optional(),
  email: z.string().email().optional(),
  address: AddressSchema.optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').nullable().optional(),
});

export type CreateShopDto = z.infer<typeof CreateShopSchema>;
export type UpdateShopDto = z.infer<typeof UpdateShopSchema>;
