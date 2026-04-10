import { z } from 'zod';

const ProductImageSchema = z.object({
  url: z.string().url('Image URL must be valid'),
  publicId: z.string().optional(),
  alt: z.string().default(''),
  isPrimary: z.boolean().default(false),
});

export const CreateProductSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  price: z.number().int().positive('Price must be positive (in pesewas)'),
  compareAtPrice: z.number().int().positive().optional(),
  sku: z.string().max(100).optional(),
  quantity: z.number().int().min(0).default(0),
  trackInventory: z.boolean().default(false),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  images: z.array(ProductImageSchema).max(5).default([]),
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const PublishProductSchema = z.object({
  status: z.enum(['active', 'draft', 'archived']),
});

export type CreateProductDto = z.infer<typeof CreateProductSchema>;
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;
