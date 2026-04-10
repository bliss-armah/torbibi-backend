export const GHANA_PHONE_REGEX = /^(\+233|0)(2[034567]|5[045679])\d{7}$/;

export const CACHE_TTL = {
  OTP: 600,            // 10 minutes
  SHOP: 3600,          // 1 hour
  PRODUCT: 1800,       // 30 minutes
  USER_SESSION: 86400, // 24 hours
  STOREFRONT: 300,     // 5 minutes (public pages)
} as const;

export const CACHE_PREFIX = {
  OTP: 'otp:',
  SHOP: 'shop:',
  PRODUCT: 'product:',
  STOREFRONT: 'storefront:',
  RATE_LIMIT: 'rl:',
} as const;

export const QUEUE_NAMES = {
  SMS: 'sms',
  ORDER: 'order',
  PAYMENT_VERIFY: 'payment-verify',
  NOTIFICATIONS: 'notifications',
} as const;

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

export const SHOP_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
} as const;

// Allowed image MIME types for upload validation
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// Maximum image upload size in bytes (1 MB)
export const MAX_IMAGE_SIZE_BYTES = 1024 * 1024;

// Maximum images per product
export const MAX_PRODUCT_IMAGES = 5;
