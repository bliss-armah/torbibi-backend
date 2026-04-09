import { z } from 'zod';

// ─── Transfer Recipient ──────────────────────────────────────────────────────

const GHANA_MOMO_NETWORKS = ['MTN', 'ATL', 'VOD'] as const;

export const RegisterRecipientSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('mobile_money'),
    accountName: z.string().min(2, 'Account name is required'),
    // Phone number (Ghana format) used as the mobile money account number
    accountNumber: z
      .string()
      .regex(/^(\+233|0)(2[034567]|5[045679])\d{7}$/, 'Enter a valid Ghanaian phone number'),
    bankCode: z.enum(GHANA_MOMO_NETWORKS, {
      errorMap: () => ({ message: 'Network must be MTN, ATL (AirtelTigo), or VOD (Vodafone)' }),
    }),
  }),
  z.object({
    type: z.literal('ghipss'),
    accountName: z.string().min(2, 'Account name is required'),
    accountNumber: z.string().min(5, 'Valid account number required'),
    bankCode: z.string().min(3, 'Bank code required'),
  }),
]);

export type RegisterRecipientDto = z.infer<typeof RegisterRecipientSchema>;

// ─── Payout listing query ────────────────────────────────────────────────────

export const PayoutQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PayoutQueryDto = z.infer<typeof PayoutQuerySchema>;
