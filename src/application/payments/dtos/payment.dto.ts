import { z } from 'zod';

const GHANA_MOMO_NETWORKS = ['MTN', 'ATL', 'VOD'] as const;

export const RegisterSubaccountSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('mobile_money'),
    accountName: z.string().min(2, 'Account name is required'),
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

export type RegisterSubaccountDto = z.infer<typeof RegisterSubaccountSchema>;
