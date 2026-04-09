import { z } from 'zod';
import { GHANA_PHONE_REGEX } from '../../../shared/constants';

export const RequestOtpSchema = z.object({
  phone: z.string().regex(GHANA_PHONE_REGEX, 'Invalid Ghanaian phone number'),
  type: z.enum(['login', 'register']).default('login'),
});

export const VerifyOtpSchema = z.object({
  phone: z.string().regex(GHANA_PHONE_REGEX, 'Invalid Ghanaian phone number'),
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
  type: z.enum(['login', 'register']).default('login'),
});

export type RequestOtpDto = z.infer<typeof RequestOtpSchema>;
export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;

export type AuthTokensDto = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string;
    name: string | null;
    role: string;
    isPhoneVerified: boolean;
  };
};
