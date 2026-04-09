import { IOtpRepository } from '../../../domain/auth/repositories/IOtpRepository';
import { IUserRepository } from '../../../domain/users/repositories/IUserRepository';
import { Otp } from '../../../domain/auth/entities/Otp';
import { User } from '../../../domain/users/entities/User';
import { RequestOtpDto } from '../dtos/auth.dto';
import { enqueueSms } from '../../../infrastructure/queue/producers/sms.producer';
import { generateOtp, otpExpiresAt } from '../../../shared/utils/otp';
import { cacheGet, cacheSet } from '../../../infrastructure/cache/redis';
import { CACHE_PREFIX } from '../../../shared/constants';
import { TooManyRequestsError } from '../../../shared/errors';

const OTP_RATE_LIMIT_KEY = (phone: string) => `${CACHE_PREFIX.RATE_LIMIT}otp:${phone}`;
const MAX_OTP_REQUESTS_PER_WINDOW = parseInt(process.env.OTP_RATE_LIMIT_MAX ?? '5', 10);
const OTP_WINDOW_SECONDS = parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS ?? '900000', 10) / 1000;

export class RequestOtpUseCase {
  constructor(
    private readonly otpRepo: IOtpRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(dto: RequestOtpDto): Promise<{ isNewUser: boolean }> {
    // Rate limit OTP requests — critical to prevent SMS flooding
    const rateLimitKey = OTP_RATE_LIMIT_KEY(dto.phone);
    const requestCount = (await cacheGet<number>(rateLimitKey)) ?? 0;

    if (requestCount >= MAX_OTP_REQUESTS_PER_WINDOW) {
      throw new TooManyRequestsError('Too many OTP requests. Please wait 15 minutes.');
    }

    // Invalidate any pending OTPs for this phone+type so only one is active
    await this.otpRepo.invalidateAllForPhone(dto.phone, dto.type);

    const code = generateOtp(parseInt(process.env.OTP_LENGTH ?? '6', 10));
    const expiresAt = otpExpiresAt(parseInt(process.env.OTP_EXPIRY_MINUTES ?? '10', 10));

    const otp = Otp.create({ phone: dto.phone, code, type: dto.type, expiresAt });
    await this.otpRepo.save(otp);

    // Check if this is a new user (affects frontend flow)
    const isNewUser = !(await this.userRepo.existsByPhone(dto.phone));

    // Register new users immediately so they exist when OTP is verified
    if (isNewUser) {
      const user = User.create({ phone: dto.phone });
      await this.userRepo.save(user);
    }

    // Send via queue — non-blocking, retried on failure
    await enqueueSms({ type: 'otp', phone: dto.phone, code });

    // Increment rate limit counter
    const newCount = requestCount + 1;
    await cacheSet(rateLimitKey, newCount, OTP_WINDOW_SECONDS);

    return { isNewUser };
  }
}
