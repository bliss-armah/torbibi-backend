import crypto from 'crypto';

/**
 * Generates a cryptographically secure numeric OTP.
 * Using crypto.randomInt keeps it uniform (no modulo bias).
 */
export function generateOtp(length: number = 6): string {
  const max = Math.pow(10, length);
  const otp = crypto.randomInt(0, max);
  return otp.toString().padStart(length, '0');
}

export function otpExpiresAt(minutes: number = 10): Date {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + minutes);
  return expires;
}

export function isOtpExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}
