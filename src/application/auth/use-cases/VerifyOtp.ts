import jwt from 'jsonwebtoken';
import { IOtpRepository } from '../../../domain/auth/repositories/IOtpRepository';
import { IUserRepository } from '../../../domain/users/repositories/IUserRepository';
import { VerifyOtpDto, AuthTokensDto } from '../dtos/auth.dto';
import { UnauthorizedError, NotFoundError } from '../../../shared/errors';

function generateTokens(userId: string, phone: string, role: string): {
  accessToken: string;
  refreshToken: string;
} {
  const secret = process.env.JWT_SECRET ?? 'fallback-secret';
  const refreshSecret = process.env.JWT_REFRESH_SECRET ?? 'fallback-refresh-secret';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessToken = jwt.sign(
    { sub: userId, phone, role },
    secret,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = jwt.sign(
    { sub: userId },
    refreshSecret,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '30d') as any }
  );

  return { accessToken, refreshToken };
}

export class VerifyOtpUseCase {
  constructor(
    private readonly otpRepo: IOtpRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(dto: VerifyOtpDto): Promise<AuthTokensDto> {
    const otp = await this.otpRepo.findLatestByPhone(dto.phone, dto.type);

    if (!otp) {
      throw new UnauthorizedError('No active OTP found. Please request a new one.');
    }

    const isValid = otp.verify(dto.code);
    await this.otpRepo.update(otp);

    if (!isValid) {
      if (otp.isExpired()) {
        throw new UnauthorizedError('OTP has expired. Please request a new one.');
      }
      if (otp.isExhausted()) {
        throw new UnauthorizedError('Too many invalid attempts. Please request a new OTP.');
      }
      throw new UnauthorizedError('Invalid OTP code.');
    }

    const user = await this.userRepo.findByPhone(dto.phone);
    if (!user) {
      throw new NotFoundError('User');
    }

    user.verifyPhone();
    user.recordLogin();
    await this.userRepo.update(user);

    const { accessToken, refreshToken } = generateTokens(user.id, user.phone, user.role);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
    };
  }
}
